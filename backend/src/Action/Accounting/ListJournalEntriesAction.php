<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Domain\Entity\LedgerTransaction;
use App\Infrastructure\Service\{ApiResponse, LedgerTransactionEnricher};
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * List journal entries — every LedgerTransaction across the whole
 * ledger, filterable by date range, account, callback reference,
 * transaction type, and amount range. Paginated with metadata.
 *
 * This is the global counterpart to:
 *   - GET /gl-accounts/:id/transactions  (scoped to one GL)
 *   - GET /customer-ledgers/:id/transactions  (scoped to one sub-ledger)
 *   - GET /loans/:id/customer-ledger  (scoped to one loan)
 *
 * Users with accounting.view need to answer 'show me every journal
 * entry posted this month with amount > ₦500k' or 'what did loan
 * DISB-LN0042 do to the GL?' without already knowing the GL ID or
 * the customer ledger ID. That's what this endpoint provides.
 *
 * Contract:
 *   GET /api/journal-entries
 *   Query params (all optional):
 *     page, per_page  (standard pagination)
 *     search         matches narration, reference, or callback
 *     gl_id          filter to one GL account
 *     trans_type     'CR' or 'DR'
 *     date_from      'YYYY-MM-DD' — inclusive lower bound on trans_date
 *     date_to        'YYYY-MM-DD' — inclusive upper bound on trans_date
 *     callback       exact callback ref match (e.g. 'DISB-LN0042-20260423-...')
 *     min_amount     decimal string, inclusive
 *     max_amount     decimal string, inclusive
 *     sort_by        default 'createdAt'
 *     sort_dir       'ASC' | 'DESC' (default 'DESC')
 *
 * Response:
 *   { status: 'success', data: [ LedgerTransaction.toArray(), ... ],
 *     meta: { page, per_page, total, pages } }
 *
 * Design note on date filtering: ledger_transactions stores date as
 * three string columns (trans_year, trans_month, trans_day) for
 * historical reasons (disbursement-effective-date semantics that
 * don't always match wall-clock posting time). Phase 2 added a
 * Postgres-generated posting_date date column (read-only on the
 * entity, indexed) that we use for range filtering — gives us
 * indexable seeks instead of full-table CONCAT scans.
 */
final class ListJournalEntriesAction
{
    use ApiResponse;

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly LedgerTransactionEnricher $enricher,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $params = $request->getQueryParams();
        $p = $this->getPaginationParams($params);
        $offset = $p['offset'];
        $limit = $p['per_page'];

        $qb = $this->em->createQueryBuilder()
            ->select('t')
            ->from(LedgerTransaction::class, 't');

        // Global search across narration, reference, callback. LOWER
        // for case-insensitive match; LIKE with leading + trailing %
        // is slow without a trigram index but acceptable for admin
        // reports at current scale. Revisit if this endpoint becomes
        // high-traffic.
        $search = trim((string) ($params['search'] ?? ''));
        if ($search !== '') {
            $qb->andWhere($qb->expr()->orX(
                $qb->expr()->like('LOWER(t.transNarration)', ':search'),
                $qb->expr()->like('LOWER(t.transReference)', ':search'),
                $qb->expr()->like('LOWER(t.transCallback)', ':search'),
            ))->setParameter('search', '%' . strtolower($search) . '%');
        }

        // GL account filter — exact match on the ManyToOne FK
        if (!empty($params['gl_id'])) {
            $qb->andWhere('t.generalLedger = :glId')
               ->setParameter('glId', (string) $params['gl_id']);
        }

        // Customer ledger filter — for drilling into a specific loan's
        // entries. Separate from gl_id so an admin can pick either or
        // both. Useful for reports like 'all entries against loan X'
        // without needing to lookup the customer ledger id first —
        // future enhancement: accept loan_id and resolve.
        if (!empty($params['customer_ledger_id'])) {
            $qb->andWhere('t.customerLedger = :clId')
               ->setParameter('clId', (string) $params['customer_ledger_id']);
        }

        // Transaction type (CR / DR)
        if (!empty($params['trans_type'])) {
            $type = strtoupper((string) $params['trans_type']);
            if (in_array($type, ['CR', 'DR'], true)) {
                $qb->andWhere('t.transType = :type')->setParameter('type', $type);
            }
        }

        // Callback exact match (drilldown to one journal's entries)
        if (!empty($params['callback'])) {
            $qb->andWhere('t.transCallback = :cb')
               ->setParameter('cb', (string) $params['callback']);
        }

        // Date range filtering — uses the Postgres-generated
        // posting_date column (mapped as $postingDate on the entity,
        // read-only). Replaces the prior CONCAT pattern which
        // couldn't use any index. Phase 2 schema-hardening migration
        // added the column + idx_lt_posting_date.
        if (!empty($params['date_from'])) {
            $qb->andWhere('t.postingDate >= :dateFrom')
               ->setParameter('dateFrom', new \DateTimeImmutable((string) $params['date_from']));
        }
        if (!empty($params['date_to'])) {
            $qb->andWhere('t.postingDate <= :dateTo')
               ->setParameter('dateTo', new \DateTimeImmutable((string) $params['date_to']));
        }

        // Amount range — NUMERIC column, direct comparison works
        if (!empty($params['min_amount'])) {
            $qb->andWhere('t.transAmount >= :minA')
               ->setParameter('minA', (string) $params['min_amount']);
        }
        if (!empty($params['max_amount'])) {
            $qb->andWhere('t.transAmount <= :maxA')
               ->setParameter('maxA', (string) $params['max_amount']);
        }

        // Total count for pagination — clone before adding sort/limit
        $countQb = clone $qb;
        $total = (int) $countQb->select('COUNT(t.id)')
            ->getQuery()->getSingleScalarResult();

        // Sort + paginate. Default to newest-first on createdAt since
        // journal rows are immutable and posting time is the natural
        // browse order. Allow override via sort_by/sort_dir.
        $sortBy = $p['sort_by'] ?? 'createdAt';
        $sortDir = strtoupper((string) ($p['sort_dir'] ?? 'DESC'));
        if (!in_array($sortDir, ['ASC', 'DESC'], true)) $sortDir = 'DESC';
        // Whitelist sortable fields to avoid injection via sort_by.
        $allowedSort = ['createdAt', 'transAmount', 'transType', 'transCallback'];
        if (!in_array($sortBy, $allowedSort, true)) $sortBy = 'createdAt';

        $qb->orderBy('t.' . $sortBy, $sortDir)
           ->setFirstResult($offset)
           ->setMaxResults($limit);

        /** @var LedgerTransaction[] $txs */
        $txs = $qb->getQuery()->getResult();
        $items = array_map(fn(LedgerTransaction $t) => $t->toArray(), $txs);

        // Enrich with posted_by_name + reversal fields. Batched lookup
        // so N rows = 1 user query + 1 reversal query, not N of each.
        $items = $this->enricher->enrich($items);

        return $this->paginated($items, $total, $p['page'], $limit);
    }
}
