<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Domain\Entity\JournalEntry;
use App\Domain\Enum\JournalEntryType;
use App\Domain\Repository\JournalEntryRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GET /api/accounting/journals
 *
 * Phase-2.5 sub-phase E endpoint. Returns paginated JournalEntry
 * headers — the new aggregate-rooted view that replaces the flat
 * "list every LedgerTransaction line" model exposed by
 * /api/journal-entries.
 *
 * Why a separate endpoint instead of a query-param flavour of
 * the existing one:
 *   - Cleaner contract — consumers know exactly what shape they're
 *     getting based on the URL, no conditional reading
 *   - Frontend can migrate at its own pace; the legacy
 *     /journal-entries endpoint stays unchanged for now
 *   - Easier to evolve independently — sub-phase F's redesigned
 *     UI calls the new endpoint, while drilldowns from the loan
 *     detail page can keep using /journal-entries until they're
 *     touched again
 *
 * The flat /journal-entries endpoint may be retired in 2.5b cleanup
 * once every consumer is migrated. This endpoint is the canonical
 * forward-going contract.
 *
 * Contract:
 *   GET /api/accounting/journals
 *   Query params (all optional):
 *     page, per_page         standard pagination
 *     search                 substring match on header narration,
 *                            reference, or legacy_callback
 *     entry_type             one of JournalEntryType values:
 *                            DISBURSEMENT, REPAYMENT, PENALTY,
 *                            WRITE_OFF, PROVISION, CLOSE, REVERSAL,
 *                            MANUAL
 *     posting_date_from      'YYYY-MM-DD' inclusive lower bound
 *     posting_date_to        'YYYY-MM-DD' inclusive upper bound
 *     include_reversals      'true' to include is_reversal=true
 *                            entries (default excludes them — most
 *                            views want business activity only)
 *     include_closing        'true' to include is_closing_entry
 *                            entries (default excludes — closing
 *                            journals are bookkeeping noise in
 *                            most browsing contexts)
 *     sort_by                'postingDate' (default), 'createdAt',
 *                            or 'entryType'. Whitelisted in the
 *                            repository.
 *     sort_dir               'ASC' | 'DESC' (default 'DESC')
 *
 * Response:
 *   {
 *     status: 'success',
 *     data: [
 *       {
 *         id, posting_date, entry_type, narration, reference,
 *         posted_by, posted_by_name, is_reversal, reversal_of_id,
 *         is_closing_entry, legacy_callback, created_at,
 *         line_count, total_amount, has_reversal,
 *         reversal: { id, posting_date, posted_by_name } | null
 *       },
 *       ...
 *     ],
 *     meta: { total, page, per_page, total_pages }
 *   }
 *
 * line_count and total_amount are computed via a single batched
 * aggregate query — N rows = 1 line aggregate query, not N.
 *
 * has_reversal + reversal: surfaces "this journal has been reversed"
 * without the frontend needing a second round-trip. Nullable —
 * null means the journal hasn't been reversed.
 */
final class ListJournalsAction
{
    use ApiResponse;

    public function __construct(
        private readonly JournalEntryRepository $journalRepo,
        private readonly \Doctrine\ORM\EntityManagerInterface $em,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $params = $request->getQueryParams();
        $p = $this->getPaginationParams($params);

        // Resolve entry_type filter. Accepts the enum string value;
        // bad values are silently ignored (returns full set) to be
        // forgiving with frontends that haven't validated the dropdown.
        $entryType = null;
        if (! empty($params['entry_type'])) {
            $entryType = JournalEntryType::tryFrom((string) $params['entry_type']);
        }

        $includeReversals = filter_var(
            $params['include_reversals'] ?? 'false',
            FILTER_VALIDATE_BOOLEAN,
        );
        $includeClosing = filter_var(
            $params['include_closing'] ?? 'false',
            FILTER_VALIDATE_BOOLEAN,
        );

        $result = $this->journalRepo->paginated(
            offset: $p['offset'],
            limit: $p['per_page'],
            entryType: $entryType,
            postingDateFrom: ! empty($params['posting_date_from'])
                ? (string) $params['posting_date_from'] : null,
            postingDateTo: ! empty($params['posting_date_to'])
                ? (string) $params['posting_date_to'] : null,
            includeReversals: $includeReversals,
            includeClosing: $includeClosing,
            search: ! empty($params['search']) ? (string) $params['search'] : null,
            sortBy: $p['sort_by'] ?? 'postingDate',
            sortDir: $p['sort_dir'] ?? 'DESC',
        );

        /** @var JournalEntry[] $journals */
        $journals = $result['items'];

        // ─── Batch enrichment ───
        // Three separate batch queries, each O(1) regardless of row
        // count: line-count + total-amount per journal, posted-by user
        // names, reversal pointers (any journal whose reversal_of_id
        // matches one of ours).
        $journalIds = array_map(fn(JournalEntry $j) => $j->getId(), $journals);

        $aggregates = $this->batchLineAggregates($journalIds);
        $reversals = $this->batchReversals($journalIds);
        // userNames must include both journal posters AND reversal
        // posters — fetch reversals first so we can pass that map in.
        $userNames = $this->batchUserNames($journals, $reversals);

        $items = [];
        foreach ($journals as $j) {
            $row = $j->toArray();
            $row['posted_by_name'] = $j->getPostedBy()
                ? ($userNames[$j->getPostedBy()] ?? null)
                : null;

            $agg = $aggregates[$j->getId()] ?? ['line_count' => 0, 'total_amount' => '0.00'];
            $row['line_count'] = (int) $agg['line_count'];
            $row['total_amount'] = $agg['total_amount']; // sum of DR side (= sum of CR side by invariant)

            $rev = $reversals[$j->getId()] ?? null;
            $row['has_reversal'] = $rev !== null;
            $row['reversal'] = $rev !== null ? [
                'id' => $rev['id'],
                'posting_date' => $rev['posting_date'],
                'posted_by' => $rev['posted_by'],
                'posted_by_name' => $rev['posted_by']
                    ? ($userNames[$rev['posted_by']] ?? null)
                    : null,
                'created_at' => $rev['created_at'],
            ] : null;

            $items[] = $row;
        }

        return $this->paginated($items, $result['total'], $p['page'], $p['per_page']);
    }

    /**
     * One query for line_count + total_amount across all journals.
     *
     * total_amount is the sum of the DR side. Since journals are
     * always balanced (postJournal validates this), DR sum == CR sum,
     * so showing one side is the canonical "magnitude" of the journal.
     *
     * @param string[] $journalIds
     * @return array<string, array{line_count: int, total_amount: string}>
     */
    private function batchLineAggregates(array $journalIds): array
    {
        if (count($journalIds) === 0) return [];

        $rows = $this->em->getConnection()->executeQuery(
            "SELECT
                journal_entry_id,
                COUNT(*) AS line_count,
                COALESCE(SUM(CASE WHEN trans_type = 'DR' THEN trans_amount ELSE 0 END), 0) AS total_amount
             FROM ledger_transactions
             WHERE journal_entry_id IN (?)
             GROUP BY journal_entry_id",
            [$journalIds],
            [\Doctrine\DBAL\ArrayParameterType::STRING],
        )->fetchAllAssociative();

        $out = [];
        foreach ($rows as $r) {
            $out[(string) $r['journal_entry_id']] = [
                'line_count' => (int) $r['line_count'],
                'total_amount' => (string) $r['total_amount'],
            ];
        }
        return $out;
    }

    /**
     * Resolve all posted_by user IDs to display names in one query.
     *
     * Collects IDs from both the journal's own posted_by AND any
     * reversal-journal posted_by (passed in via $reversals so we can
     * cover both sets in a single User query).
     *
     * @param JournalEntry[] $journals
     * @param array<string, array{id: string, posting_date: string, posted_by: ?string, created_at: string}> $reversals
     * @return array<string, string>  user_id => full_name
     */
    private function batchUserNames(array $journals, array $reversals): array
    {
        $userIds = [];
        foreach ($journals as $j) {
            if ($j->getPostedBy()) {
                $userIds[$j->getPostedBy()] = true;
            }
        }
        foreach ($reversals as $rev) {
            if (! empty($rev['posted_by'])) {
                $userIds[(string) $rev['posted_by']] = true;
            }
        }
        if (count($userIds) === 0) return [];

        $users = $this->em->createQueryBuilder()
            ->select('u')
            ->from(\App\Domain\Entity\User::class, 'u')
            ->where('u.id IN (:ids)')
            ->setParameter('ids', array_keys($userIds))
            ->getQuery()->getResult();

        $out = [];
        foreach ($users as $u) {
            /** @var \App\Domain\Entity\User $u */
            $out[$u->getId()] = $u->getFullName();
        }
        return $out;
    }

    /**
     * Find any reversal journal pointing at each of the listed
     * originals. Single query covering the entire batch.
     *
     * Used to enrich each list row with "has this been reversed?
     * if so, by whom and when?" — saves the frontend from a
     * per-row round-trip.
     *
     * @param string[] $journalIds
     * @return array<string, array{id: string, posting_date: string, posted_by: ?string, created_at: string}>
     */
    private function batchReversals(array $journalIds): array
    {
        if (count($journalIds) === 0) return [];

        $rows = $this->em->getConnection()->executeQuery(
            "SELECT id, reversal_of_id, posting_date::text AS posting_date,
                    posted_by, created_at::text AS created_at
             FROM journal_entries
             WHERE reversal_of_id IN (?)",
            [$journalIds],
            [\Doctrine\DBAL\ArrayParameterType::STRING],
        )->fetchAllAssociative();

        $out = [];
        foreach ($rows as $r) {
            $out[(string) $r['reversal_of_id']] = [
                'id' => (string) $r['id'],
                'posting_date' => (string) $r['posting_date'],
                'posted_by' => $r['posted_by'] ? (string) $r['posted_by'] : null,
                'created_at' => (string) $r['created_at'],
            ];
        }
        return $out;
    }
}
