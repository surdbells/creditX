<?php

declare(strict_types=1);

namespace App\Infrastructure\Service;

use App\Domain\Exception\DomainException;
use Doctrine\ORM\EntityManagerInterface;

/**
 * LedgerService — domain-spanning utilities for the GL.
 *
 * Phase 1 scope: the validateBatchBalance utility called by every
 * posting service to confirm a freshly-posted batch sums to zero
 * (debits == credits within the batch's trans_callback).
 *
 * Future expansion: this is the natural home for the eventual
 * PostingService that consolidates the per-service postEntry()
 * helpers scattered across DisbursementService, RepaymentService,
 * etc. For now it stays scoped to validation only — the service
 * exists so we have ONE call site to add new invariants without
 * touching every posting service.
 */
final class LedgerService
{
    /**
     * Tolerance for floating-point / decimal comparison artifacts.
     * Real imbalances are typically thousands of naira; legitimate
     * rounding noise stays well under one kobo. 0.01 is the smallest
     * value that errs on the side of false positives.
     */
    private const BALANCE_TOLERANCE_KOBO = '0.01';

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly SettingsCacheService $settings,
        private readonly AccountingDateService $accountingDate,
    ) {}

    /**
     * Verify the ledger batch identified by $callback sums to zero
     * (debits == credits across all rows sharing that callback).
     *
     * Called at the END of every posting transaction (after persist
     * + flush) by DisbursementService, RepaymentService,
     * LoanLifecycleService, OverdueService, ProvisionService,
     * JournalReversalService, and PeriodCloseService.
     *
     * @throws DomainException when the batch is unbalanced. Caller
     *                         should treat this as a bug — the wrapping
     *                         transaction should already have been
     *                         rolled back by the time this throws (or
     *                         the caller should rollback in response).
     *
     * Grandfathering: batches whose oldest row predates the deployment
     * cutoff (system_settings key 'accounting.batch_validation_cutoff_at')
     * are skipped. This protects historical data from being "validated"
     * retroactively when reports happen to call this — only batches
     * created AFTER deployment time are subject to the check.
     *
     * The cutoff is set at deployment time by an operator running:
     *   UPDATE system_settings
     *   SET value = NOW()::text
     *   WHERE key = 'accounting.batch_validation_cutoff_at';
     *
     * If unset, the validation is permissive (returns without throwing)
     * — better to miss real bugs in the early days than to crash
     * production over historical data we haven't audited.
     */
    public function validateBatchBalance(string $callback): void
    {
        if ($callback === '') {
            // No callback = no batch to validate. Defensive no-op;
            // ideally every posting path supplies a callback (we
            // should add a CHECK constraint forbidding NULL callbacks
            // in a follow-up phase).
            return;
        }

        // Grandfather guard. Skip validation for batches whose oldest
        // row was created before the deployment cutoff.
        if ($this->isPreCutoffBatch($callback)) {
            return;
        }

        $row = $this->em->getConnection()->fetchAssociative(
            "SELECT
                COALESCE(SUM(CASE WHEN trans_type = 'DR' THEN CAST(trans_amount AS NUMERIC) ELSE 0 END), 0) AS dr_total,
                COALESCE(SUM(CASE WHEN trans_type = 'CR' THEN CAST(trans_amount AS NUMERIC) ELSE 0 END), 0) AS cr_total,
                COUNT(*) AS row_count
             FROM ledger_transactions
             WHERE trans_callback = :cb",
            ['cb' => $callback]
        );

        if (! $row || (int) $row['row_count'] === 0) {
            // Empty batch. Either the callback is bogus or every
            // postEntry() call returned early (e.g. all amounts were
            // zero, which DisbursementService::postEntry skips). Not
            // an imbalance per se — skip silently.
            return;
        }

        $dr = (string) $row['dr_total'];
        $cr = (string) $row['cr_total'];
        $diff = bcsub($dr, $cr, 2);
        $absDiff = str_starts_with($diff, '-') ? substr($diff, 1) : $diff;

        if (bccomp($absDiff, self::BALANCE_TOLERANCE_KOBO, 2) > 0) {
            throw new DomainException(sprintf(
                'Unbalanced ledger batch "%s": debits=%s, credits=%s, diff=%s. ' .
                'This indicates a posting bug — the transaction should not commit. ' .
                'Check the calling service\'s postEntry() invocations.',
                $callback,
                $dr,
                $cr,
                $diff
            ));
        }
    }

    /**
     * Returns true if the batch's oldest row predates the deployment
     * cutoff timestamp. False if no cutoff is configured or the
     * batch is fresh.
     *
     * Looking up the oldest row is one indexed query (idx_lt_callback
     * exists). Cheap to call per posting transaction.
     */
    private function isPreCutoffBatch(string $callback): bool
    {
        $cutoff = $this->settings->get('accounting.batch_validation_cutoff_at');
        if ($cutoff === null || $cutoff === '') {
            return false;
        }

        $oldest = $this->em->getConnection()->fetchOne(
            "SELECT MIN(created_at) FROM ledger_transactions WHERE trans_callback = :cb",
            ['cb' => $callback]
        );
        if (! $oldest) {
            return false;
        }

        // String comparison works because Postgres timestamp output
        // is ISO-format-ish ('YYYY-MM-DD HH:MM:SS...') which sorts
        // lexicographically the same as chronologically.
        return strcmp((string) $oldest, $cutoff) < 0;
    }

    // ──────────────────────────────────────────────────────────────
    // Phase 2.5 sub-phase C — JournalEntry-aware helpers
    // ──────────────────────────────────────────────────────────────

    /**
     * Verify the ledger batch identified by a JournalEntry header
     * sums to zero (debits == credits across all linked lines).
     *
     * Phase-2.5 replacement for validateBatchBalance(string $callback).
     * Posting services migrated in sub-phase D will call this directly.
     *
     * The pre-cutoff grandfathering applies the same way: if the batch's
     * oldest line predates the deployment cutoff, validation is a no-op.
     * (In practice, headers created after sub-phase D won't be subject
     * to this — they'll always be post-cutoff — but we keep the check
     * for symmetry with the legacy method.)
     *
     * @throws DomainException when the batch is unbalanced.
     */
    public function validateBatchBalanceByHeader(\App\Domain\Entity\JournalEntry $header): void
    {
        $hid = $header->getId();

        // Pre-cutoff guard — same logic as the callback version, just
        // joined through journal_entry_id.
        $cutoff = $this->settings->get('accounting.batch_validation_cutoff_at');
        if ($cutoff !== null && $cutoff !== '') {
            $oldest = $this->em->getConnection()->fetchOne(
                "SELECT MIN(created_at) FROM ledger_transactions WHERE journal_entry_id = :hid",
                ['hid' => $hid]
            );
            if ($oldest && strcmp((string) $oldest, $cutoff) < 0) {
                return;
            }
        }

        $row = $this->em->getConnection()->fetchAssociative(
            "SELECT
                COALESCE(SUM(CASE WHEN trans_type = 'DR' THEN CAST(trans_amount AS NUMERIC) ELSE 0 END), 0) AS dr_total,
                COALESCE(SUM(CASE WHEN trans_type = 'CR' THEN CAST(trans_amount AS NUMERIC) ELSE 0 END), 0) AS cr_total,
                COUNT(*) AS row_count
             FROM ledger_transactions
             WHERE journal_entry_id = :hid",
            ['hid' => $hid]
        );

        if (! $row || (int) $row['row_count'] === 0) {
            // Empty journal — defensive no-op. postJournal rejects
            // empty line arrays before reaching this point, so this
            // branch only fires if something else (e.g. a bug or
            // hand-written test code) created a header without lines.
            return;
        }

        $dr = (string) $row['dr_total'];
        $cr = (string) $row['cr_total'];
        $diff = bcsub($dr, $cr, 2);
        $absDiff = str_starts_with($diff, '-') ? substr($diff, 1) : $diff;

        if (bccomp($absDiff, self::BALANCE_TOLERANCE_KOBO, 2) > 0) {
            throw new DomainException(sprintf(
                'Unbalanced journal entry %s (type=%s): debits=%s, credits=%s, diff=%s. ' .
                'This indicates a posting bug — the transaction should not commit.',
                $hid,
                $header->getEntryType()->value,
                $dr,
                $cr,
                $diff
            ));
        }
    }

    /**
     * Post a balanced journal in one call.
     *
     * Sub-phase C helper that consolidates the create-header + create-
     * lines + flush + validate-balance pattern that's about to be
     * duplicated across seven posting services in sub-phase D.
     *
     * The caller is responsible for the surrounding transaction:
     *
     *   $em->beginTransaction();
     *   try {
     *     // ... other writes (loan status, schedule, etc.) ...
     *     $journal = $ledgerService->postJournal(
     *       entryType: JournalEntryType::DISBURSEMENT,
     *       postingDate: '2026-04-29',
     *       narration: 'Loan disbursement — APP-2026-00123',
     *       postedBy: $userId,
     *       lines: [
     *         ['gl' => $bank, 'type' => DR, 'amount' => '50000', 'narration' => 'NET CASH OUT'],
     *         ['gl' => $lr,   'type' => CR, 'amount' => '50000', 'narration' => 'LOAN ASSET'],
     *       ],
     *       legacyCallback: $callback,  // optional — populates trans_callback
     *                                    // on lines for backward compat
     *     );
     *     $em->commit();
     *   } catch (...) { $em->rollback(); }
     *
     * Why the helper flushes internally: validateBatchBalanceByHeader
     * queries the DB by journal_entry_id, so the lines must be
     * persisted before validation runs. The caller can keep adding
     * other writes after postJournal returns; those just get a
     * second flush at commit time.
     *
     * Why the helper does NOT manage the outer transaction: posting
     * services typically write more than just the journal (loan
     * status updates, schedule modifications, repayment plan rows,
     * etc.). Those must commit atomically with the journal. The
     * service wraps everything; postJournal is just one piece.
     *
     * Line array shape (per element):
     *
     *   gl              GeneralLedger entity (required)
     *   customerLedger  CustomerLedger entity (optional, for sub-ledger lines)
     *   type            TransactionType::DR or ::CR (required)
     *   amount          string, positive magnitude in naira (required, > 0)
     *   narration       string, line-level description (required)
     *   reference       string, optional line-level reference
     *   isRepayment     bool, optional (legacy flag, defaults false)
     *
     * @param array<int, array<string, mixed>> $lines
     * @param string|null $legacyCallback Populates trans_callback on every
     *                    line for backward compat with consumers that
     *                    haven't migrated to journal_entry_id yet.
     *                    Sub-phase E will remove this once consumers
     *                    are migrated; sub-phase B's backfill stored
     *                    historical callbacks on the header so this
     *                    parameter is purely for new postings.
     * @param bool $isClosingEntry Marks the entire journal as a closing
     *                    entry. PeriodCloseService passes true; everyone
     *                    else passes false (default). Denormalized to
     *                    each line per Q2c.
     * @param string|null $reference Optional external reference for the
     *                    header (cross-system reconciliation key).
     * @param bool $isReversal If true, the journal is a reversal of
     *                    another. JournalReversalService and
     *                    ProvisionService::reverseProvisionRun pass
     *                    true; everyone else passes false.
     * @param string|null $reversalOfId UUID of the original JournalEntry
     *                    being reversed. Required if isReversal=true,
     *                    must be null otherwise.
     */
    public function postJournal(
        \App\Domain\Enum\JournalEntryType $entryType,
        string $postingDate,
        string $narration,
        ?string $postedBy,
        array $lines,
        ?string $legacyCallback = null,
        bool $isClosingEntry = false,
        ?string $reference = null,
        bool $isReversal = false,
        ?string $reversalOfId = null,
        ?string $backdateReason = null,
    ): \App\Domain\Entity\JournalEntry {
        // ─── Accounting-date control ────────────────────────────────
        // THE choke point. Every posting service in the system reaches the
        // ledger through this method and nothing constructs a
        // LedgerTransaction directly, so validating here covers every module
        // that exists and every module added later — which is exactly what the
        // requirement asks for, without touching sixteen services.
        //
        // No-op while accounting.enforce_accounting_date is off, so this is
        // inert until an operator switches the framework on.
        $requestedDate = $postingDate;
        $postingDate = $this->accountingDate->resolveForLedger($postingDate);
        // ────────────────────────────────────────────────────────────

        // ─── Pre-flight validation ──────────────────────────────────
        if (count($lines) === 0) {
            throw new DomainException('postJournal requires at least one line');
        }
        if ($isReversal && $reversalOfId === null) {
            throw new DomainException('postJournal: isReversal=true requires a reversalOfId');
        }
        if (! $isReversal && $reversalOfId !== null) {
            throw new DomainException('postJournal: reversalOfId given but isReversal=false');
        }

        // Pre-check balance before persisting anything. Cheaper to
        // fail early than to flush + ROLLBACK on validation failure.
        // We allow tiny tolerance for the same reason as the post-flush
        // check (BCMath rounding noise across many lines).
        $totalDr = '0.00';
        $totalCr = '0.00';
        foreach ($lines as $i => $line) {
            $this->validateLineShape($line, $i);
            if ($line['type'] === \App\Domain\Enum\TransactionType::DR) {
                $totalDr = bcadd($totalDr, (string) $line['amount'], 2);
            } else {
                $totalCr = bcadd($totalCr, (string) $line['amount'], 2);
            }
        }
        $diff = bcsub($totalDr, $totalCr, 2);
        $absDiff = str_starts_with($diff, '-') ? substr($diff, 1) : $diff;
        if (bccomp($absDiff, self::BALANCE_TOLERANCE_KOBO, 2) > 0) {
            throw new DomainException(sprintf(
                'postJournal: unbalanced lines submitted (type=%s): debits=%s, credits=%s, diff=%s. ' .
                'This is a programming error; the caller assembled an unbalanced batch.',
                $entryType->value,
                $totalDr,
                $totalCr,
                $diff
            ));
        }

        // ─── Build header ───────────────────────────────────────────
        $header = new \App\Domain\Entity\JournalEntry();
        $header->setPostingDate(new \DateTimeImmutable($postingDate));
        $header->setEntryType($entryType);
        $header->setNarration($this->truncate($narration, 500));
        $header->setReference($reference !== null ? $this->truncate($reference, 100) : null);
        $header->setPostedBy($postedBy);
        $header->setIsReversal($isReversal);
        $header->setReversalOfId($reversalOfId);
        $header->setIsClosingEntry($isClosingEntry);
        $header->setLegacyCallback($legacyCallback !== null ? $this->truncate($legacyCallback, 100) : null);
        $this->em->persist($header);

        // ─── Build lines ────────────────────────────────────────────
        // Date components for the existing year/month/day string columns
        // (still required by the entity even though posting_date is
        // generated). Parse from postingDate to keep them consistent.
        $pd = new \DateTimeImmutable($postingDate);
        $year = $pd->format('Y');
        $month = $pd->format('m');
        $day = $pd->format('d');

        foreach ($lines as $line) {
            $entry = new \App\Domain\Entity\LedgerTransaction();
            $entry->setJournalEntry($header);
            $entry->setGeneralLedger($line['gl']);
            if (isset($line['customerLedger']) && $line['customerLedger'] !== null) {
                $entry->setCustomerLedger($line['customerLedger']);
            }
            $entry->setTransType($line['type']);
            $entry->setTransAmount((string) $line['amount']);
            $entry->setTransNarration($this->truncate((string) $line['narration'], 500));
            if (isset($line['reference']) && $line['reference'] !== null) {
                $entry->setTransReference($this->truncate((string) $line['reference'], 50));
            }
            if ($legacyCallback !== null) {
                $entry->setTransCallback($this->truncate($legacyCallback, 50));
            }
            $entry->setTransDate($year, $month, $day);
            $entry->setPostedBy($postedBy);
            $entry->setIsRepayment((bool) ($line['isRepayment'] ?? false));
            $entry->setIsClosingEntry($isClosingEntry);
            // Phase-2.5: reversalOfLineId points at the original LINE
            // being reversed (LedgerTransaction.id, not JournalEntry.id).
            // Used by reversal flows that mirror DR/CR per line — line-
            // level traceability supplements the header-level
            // reversal_of_id (which points at the original journal).
            if (isset($line['reversalOfLineId']) && $line['reversalOfLineId'] !== null) {
                $entry->setReversalOfId((string) $line['reversalOfLineId']);
            }
            $this->em->persist($entry);
        }

        // ─── Flush and validate ─────────────────────────────────────
        // Flush so validateBatchBalanceByHeader can query against the
        // persisted rows. The caller's outer transaction is still open;
        // this flush doesn't commit anything, just sends the INSERTs
        // to the DB connection.
        $this->em->flush();
        $this->validateBatchBalanceByHeader($header);

        // Record the forensic trail for anything that did NOT land on the
        // current accounting date. Written after the flush so the journal id
        // is real, and inside the caller's transaction so an audit row can
        // never survive a rolled-back posting.
        $this->accountingDate->recordPostingAudit(
            $header,
            $postingDate,
            $requestedDate,
            $postedBy,
            $backdateReason,
        );

        return $header;
    }

    /**
     * Validate a single line array's shape. Throws DomainException with
     * a clear message identifying which line and what's missing — these
     * errors only fire for programming mistakes in the calling service,
     * so we want them loud and specific.
     *
     * @param array<string, mixed> $line
     */
    private function validateLineShape(array $line, int $index): void
    {
        if (! isset($line['gl']) || ! $line['gl'] instanceof \App\Domain\Entity\GeneralLedger) {
            throw new DomainException("postJournal line[{$index}]: 'gl' must be a GeneralLedger entity");
        }
        if (! isset($line['type']) || ! $line['type'] instanceof \App\Domain\Enum\TransactionType) {
            throw new DomainException("postJournal line[{$index}]: 'type' must be a TransactionType enum");
        }
        if (! isset($line['amount'])) {
            throw new DomainException("postJournal line[{$index}]: 'amount' is required");
        }
        $amount = (string) $line['amount'];
        if (! preg_match('/^\d+(\.\d+)?$/', $amount) || bccomp($amount, '0.00', 2) <= 0) {
            // Reject zero, negative, and non-numeric. The Phase-1 CHECK
            // constraint already enforces > 0 at the DB level; pre-checking
            // here gives a better error message.
            throw new DomainException("postJournal line[{$index}]: 'amount' must be a positive numeric (got: " . var_export($line['amount'], true) . ')');
        }
        if (! isset($line['narration']) || $line['narration'] === '') {
            throw new DomainException("postJournal line[{$index}]: 'narration' is required");
        }
    }

    /**
     * Defensive truncation. Schema columns have varchar(N) limits;
     * passing longer strings would throw at INSERT time with an opaque
     * Postgres error. We truncate with a '...' suffix so the original
     * intent is still partially visible in the database.
     */
    private function truncate(string $s, int $max): string
    {
        if (strlen($s) <= $max) return $s;
        return substr($s, 0, $max - 3) . '...';
    }
}
