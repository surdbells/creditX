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
}
