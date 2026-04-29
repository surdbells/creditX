<?php
declare(strict_types=1);
namespace App\Infrastructure\Service;

use App\Domain\Entity\JournalEntry;
use App\Domain\Entity\LedgerTransaction;
use App\Domain\Enum\JournalEntryType;
use App\Domain\Enum\TransactionType;
use App\Domain\Exception\DomainException;
use App\Domain\Repository\LedgerTransactionRepository;
use Doctrine\ORM\EntityManagerInterface;

final class JournalReversalService
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly LedgerTransactionRepository $txRepo,
        private readonly PeriodGuardService $periodGuard,
        private readonly LedgerService $ledgerService,
    ) {}

    /**
     * Reverse a posted journal entry by creating mirror CR/DR entries.
     *
     * Phase-2.5 D.7: now uses the JournalEntry aggregate. Given any
     * line ID, we resolve its JournalEntry header, find all sibling
     * lines via journal_entry_id (more reliable than the legacy
     * callback-string match), and post a reversal journal that
     * points back via header-level reversal_of_id and per-line
     * reversalOfLineId.
     */
    public function reverse(string $transactionId, ?string $userId = null, ?string $reason = null): array
    {
        $original = $this->txRepo->find($transactionId);
        if ($original === null) {
            throw new DomainException('Transaction not found');
        }

        // Refuse to reverse a line that's already a reversal (line-level
        // check — the reversal_of_id pointer means this line was created
        // BY a reversal flow). Reversing a reversal would create a
        // 'restore' journal which we deliberately don't support; if the
        // user wants to undo a reversal, they should re-post the
        // original from scratch.
        if ($original->getReversalOfId() !== null) {
            throw new DomainException('Cannot reverse a reversal entry');
        }

        // Resolve the original journal header. Sub-phase A added the
        // FK; sub-phase B's backfill populated it for historical lines;
        // D.1-D.6 ensured new postings always set it. By the time D.9
        // makes the column NOT NULL, this can never be null. During
        // the migration window (between A and D.9), defend against
        // legacy lines that escaped backfill.
        $originalHeader = $original->getJournalEntry();
        if ($originalHeader === null) {
            throw new DomainException(
                'Original transaction has no JournalEntry header. Run '
              . 'sub-phase B backfill (migrate-backfill-journal-entries.php) '
              . 'before reversing legacy lines.'
            );
        }

        // Refuse to reverse a journal that IS itself a reversal
        // (header-level check — supplements the line-level guard above).
        // Together these two checks ensure reversal chains can't be
        // accidentally extended.
        if ($originalHeader->isReversal()) {
            throw new DomainException('Cannot reverse a reversal journal');
        }

        // Check if this journal has already been reversed. We look for
        // any JournalEntry whose reversal_of_id points at this header.
        $existingReversal = $this->em->createQueryBuilder()
            ->select('COUNT(je.id)')
            ->from(JournalEntry::class, 'je')
            ->where('je.reversalOfId = :hid')
            ->setParameter('hid', $originalHeader->getId())
            ->getQuery()->getSingleScalarResult();
        if ((int) $existingReversal > 0) {
            throw new DomainException('Journal has already been reversed');
        }

        // Back-date guard — the reversal posts at today's date, so this
        // only blocks the rare case of today itself being in a closed
        // period. Note: reopening a period legitimately triggers
        // reversal of the closing journal, and PeriodCloseService's
        // reopenPeriod is allowed because the reversal date is today
        // (which won't be in the closed period being reopened — that
        // period is in the past).
        $this->periodGuard->assertDateOpen(date('Y-m-d'));

        // Find all sibling lines via the header. journal_entry_id is
        // the canonical batch identifier in the new model — replaces
        // the legacy findByCallback.
        $siblings = $this->em->getRepository(LedgerTransaction::class)
            ->findBy(['journalEntry' => $originalHeader]);

        if (empty($siblings)) {
            // Defensive: a header must have at least one line; anything
            // else is corrupt data. Surface it rather than silently
            // posting an empty reversal.
            throw new DomainException(
                'Original journal has no lines — cannot reverse an empty journal'
            );
        }

        // Build mirror lines: swap DR/CR, preserve amount and refs.
        // reversalOfLineId per line gives forensic traceability —
        // supplements the header-level reversal_of_id pointer.
        $reversalLines = [];
        foreach ($siblings as $entry) {
            $reversalLines[] = [
                'gl' => $entry->getGeneralLedger(),
                'customerLedger' => $entry->getCustomerLedger(),
                'type' => $entry->getTransType() === TransactionType::CR
                    ? TransactionType::DR
                    : TransactionType::CR,
                'amount' => $entry->getTransAmount(),
                'narration' => 'REVERSAL: ' . ($reason ? "{$reason} — " : '')
                    . $entry->getTransNarration(),
                'reference' => $entry->getTransReference(),
                'reversalOfLineId' => $entry->getId(),
            ];
        }

        // Reversal callback: keep the legacy 'REV-{originalCallback}-{ts}'
        // shape for trans_callback backward compat. Sub-phase B's
        // backfill resolver parsed this format; consumers reading
        // trans_callback during the migration window expect it.
        $originalCallback = $original->getTransCallback() ?? $original->getId();
        $reversalCallback = 'REV-' . $originalCallback . '-' . date('YmdHis');

        // Post the reversal journal via the helper. The original
        // journal's entry_type is preserved for the header's narration
        // context, but the reversal's entry_type is REVERSAL — that's
        // the canonical classification per the JournalEntryType enum.
        $reversalHeader = $this->ledgerService->postJournal(
            entryType: JournalEntryType::REVERSAL,
            postingDate: date('Y-m-d'),
            narration: 'Reversal of ' . $originalHeader->getEntryType()->value
                . ' journal ' . $originalHeader->getId()
                . ($reason ? " — {$reason}" : ''),
            postedBy: $userId,
            lines: $reversalLines,
            legacyCallback: $reversalCallback,
            isReversal: true,
            reversalOfId: $originalHeader->getId(),
        );

        return [
            'reversal_callback'      => $reversalCallback,
            'reversal_journal_id'    => $reversalHeader->getId(),
            'reversed_entries'       => count($siblings),
            'original_journal_id'    => $originalHeader->getId(),
            'original_callback'      => $original->getTransCallback(),
        ];
    }
}
