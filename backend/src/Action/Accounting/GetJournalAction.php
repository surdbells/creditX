<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Domain\Entity\JournalEntry;
use App\Domain\Repository\JournalEntryRepository;
use App\Infrastructure\Service\{ApiResponse, LedgerTransactionEnricher};
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GET /api/accounting/journals/{id}
 *
 * Phase-2.5 sub-phase E. Returns one JournalEntry header + all its
 * lines + reversal context (if reversed) in a single round-trip.
 *
 * Designed for the redesigned Journal Entries page (sub-phase F):
 * the list view shows headers, clicking one expands to show the
 * lines fetched from this endpoint.
 *
 * Contract:
 *   GET /api/accounting/journals/{id}
 *
 * Response:
 *   {
 *     status: 'success',
 *     data: {
 *       header: {
 *         id, posting_date, entry_type, narration, reference,
 *         posted_by, posted_by_name, is_reversal, reversal_of_id,
 *         is_closing_entry, legacy_callback, created_at,
 *       },
 *       lines: [
 *         { id, gl_id, gl_code, gl_name, customer_ledger_id,
 *           customer_ledger_no, trans_type, trans_amount,
 *           trans_narration, trans_reference, is_repayment,
 *           is_closing_entry, posted_by, posted_by_name,
 *           reversal_of_id, ... }
 *         ...
 *       ],
 *       totals: { dr: '50000.00', cr: '50000.00', balanced: true },
 *       reversal: { ... } | null,    // if THIS journal was reversed,
 *                                    // points at the reversal journal
 *       reverses: { ... } | null,    // if THIS journal IS a reversal,
 *                                    // points at the original
 *     }
 *   }
 *
 * Lines ordered DR-first then by created_at — matches how
 * accountants read journals on paper.
 *
 * 404 if the journal id doesn't exist.
 */
final class GetJournalAction
{
    use ApiResponse;

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly JournalEntryRepository $journalRepo,
        private readonly LedgerTransactionEnricher $enricher,
    ) {}

    public function __invoke(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args,
    ): ResponseInterface {
        $id = (string) ($args['id'] ?? '');
        /** @var JournalEntry|null $journal */
        $journal = $this->em->find(JournalEntry::class, $id);
        if ($journal === null) {
            return $this->notFound('Journal entry not found');
        }

        $lines = $this->journalRepo->getLines($journal);
        $lineRows = array_map(fn($lt) => $lt->toArray(), $lines);
        // Reuse the existing enricher to add posted_by_name +
        // reversal annotations on each line. Sub-phase D.7 added
        // the journal-level reversal pointers; the line-level ones
        // (reversalOfLineId on the line) were also populated, so
        // the existing enricher works against the new model
        // without modification.
        $lineRows = $this->enricher->enrich($lineRows);

        // ─── Totals ───
        // DR vs CR sum across the lines. Should always balance for
        // any journal the helper produced; we surface the sums (and
        // an explicit 'balanced' flag) for UI display and as a
        // self-check in case some legacy/backfilled data is off.
        $drTotal = '0.00';
        $crTotal = '0.00';
        foreach ($lines as $lt) {
            if ($lt->getTransType()->value === 'DR') {
                $drTotal = bcadd($drTotal, $lt->getTransAmount(), 2);
            } else {
                $crTotal = bcadd($crTotal, $lt->getTransAmount(), 2);
            }
        }
        $diff = bcsub($drTotal, $crTotal, 2);
        $absDiff = str_starts_with($diff, '-') ? substr($diff, 1) : $diff;
        $balanced = bccomp($absDiff, '0.01', 2) <= 0;

        // ─── Header enrichment with posted_by_name ───
        $headerRow = $journal->toArray();
        if ($journal->getPostedBy()) {
            $user = $this->em->find(\App\Domain\Entity\User::class, $journal->getPostedBy());
            $headerRow['posted_by_name'] = $user?->getFullName();
        } else {
            $headerRow['posted_by_name'] = null;
        }

        // ─── Reversal context ───
        // 'reversal'  = a reversal journal that targeted THIS one
        //               (this journal has been reversed)
        // 'reverses'  = the journal this one is a reversal OF
        //               (this journal IS a reversal)
        // Both can be null. Both can never be set simultaneously
        // because we don't allow reversing a reversal — D.7's
        // header-level guard.
        $reversalRow = null;
        $reverseInfo = $this->journalRepo->findReversal($journal);
        if ($reverseInfo !== null) {
            $reversalRow = $reverseInfo->toArray();
            if ($reverseInfo->getPostedBy()) {
                $u = $this->em->find(\App\Domain\Entity\User::class, $reverseInfo->getPostedBy());
                $reversalRow['posted_by_name'] = $u?->getFullName();
            }
        }

        $reversesRow = null;
        if ($journal->isReversal() && $journal->getReversalOfId()) {
            $original = $this->em->find(JournalEntry::class, $journal->getReversalOfId());
            if ($original !== null) {
                $reversesRow = $original->toArray();
                if ($original->getPostedBy()) {
                    $u = $this->em->find(\App\Domain\Entity\User::class, $original->getPostedBy());
                    $reversesRow['posted_by_name'] = $u?->getFullName();
                }
            }
        }

        return $this->success([
            'header' => $headerRow,
            'lines'  => $lineRows,
            'totals' => [
                'dr'       => $drTotal,
                'cr'       => $crTotal,
                'balanced' => $balanced,
            ],
            'reversal' => $reversalRow, // this journal has been reversed by ...
            'reverses' => $reversesRow, // this journal IS a reversal of ...
        ]);
    }
}
