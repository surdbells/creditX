<?php
declare(strict_types=1);

namespace App\Infrastructure\Service;

use App\Domain\Entity\MakerCheckerRequest;
use App\Domain\Entity\User;
use App\Domain\Exception\DomainException;
use App\Domain\Repository\LoanRepository;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Executes the underlying operation captured in a MakerCheckerRequest
 * once the checker approves.
 *
 * Prior to this service, MakerCheckerRequest::approve() only flipped
 * the entity status to APPROVED — the actual operation (disbursement,
 * reversal, etc.) never fired. The payload was captured but never
 * acted on.
 *
 * Dispatch pattern: one operation_type → one private executor method.
 * New operation types added in future plug in the same way — add a
 * case in execute(), add a private method, done.
 *
 * Invariants:
 *   - Always called within DecideMcAction's request — execution
 *     happens in the same transaction as the status flip. If the
 *     underlying operation fails, the caller can rollback both.
 *   - Checker identity available to the executor via $checker
 *     parameter — useful for audit trails within the underlying
 *     services (they record WHO triggered the execution).
 *   - Returns the result array from the underlying service, passed
 *     back to the checker's response for verification.
 */
final class MakerCheckerExecutionService
{
    public function __construct(
        private readonly DisbursementService $disbursementService,
        private readonly JournalReversalService $reversalService,
        private readonly LoanLifecycleService $lifecycleService,
        private readonly LoanRepository $loanRepo,
        private readonly EntityManagerInterface $em,
        private readonly ManualJournalService $manualJournalService,
    ) {}

    /**
     * Dispatch execution based on the maker-checker request's
     * operation_type. Only invoked when the checker APPROVES (not
     * on rejection — the request is just archived).
     *
     * @throws DomainException on unsupported operation type or if
     *                         the underlying operation fails
     */
    public function execute(MakerCheckerRequest $mc, User $checker): array
    {
        $opType = $mc->getOperationType();
        $payload = $mc->getPayload();

        return match ($opType) {
            'disbursement' => $this->executeDisbursement($payload, $checker),
            'reversal'     => $this->executeReversal($payload, $checker),
            'write_off'    => $this->executeWriteOff($payload, $checker),
            'gl_entry'     => $this->executeManualJournal($payload, $checker),
            default => throw new DomainException(
                "Maker-checker execution not implemented for operation type: {$opType}"
            ),
        };
    }

    /**
     * Execute a pending manual GL journal once the checker approves.
     *
     * The full journal is re-validated at execution time by
     * ManualJournalService::post() — period still open, GLs still active,
     * still balanced — so an approval that lands after the period closed
     * (or a GL was deactivated) fails cleanly rather than posting a bad
     * entry. The checker becomes the attributed poster.
     *
     * Expected payload keys (matches CreateManualJournalAction's capture):
     *   - posting_date
     *   - narration
     *   - reference (optional)
     *   - lines   (array of {gl_id, type, amount, ...})
     */
    private function executeManualJournal(array $payload, User $checker): array
    {
        $lines = $payload['lines'] ?? null;
        if (!is_array($lines) || count($lines) < 2) {
            throw new DomainException('Maker-checker payload missing journal lines');
        }
        $journal = $this->manualJournalService->post(
            (string) ($payload['posting_date'] ?? ''),
            (string) ($payload['narration'] ?? ''),
            isset($payload['reference']) && $payload['reference'] !== '' ? (string) $payload['reference'] : null,
            $lines,
            $checker->getId(),
        );
        return $journal->toArray();
    }

    /**
     * Execute a pending disbursement. Re-validates that the loan is
     * still in APPROVED state — if something else changed it between
     * maker submission and checker approval (e.g. someone reverted to
     * REJECTED, or the loan was already disbursed through another
     * path), the check catches that and the checker gets a clear
     * error rather than a corrupted GL.
     *
     * Expected payload keys (matches DisburseLoanAction's capture):
     *   - loan_id
     *   - settlement_gl_id
     *   - effective_date
     *   - top_up_balance (optional)
     *
     * @throws DomainException
     */
    private function executeDisbursement(array $payload, User $checker): array
    {
        $loanId = $payload['loan_id'] ?? '';
        if ($loanId === '') {
            throw new DomainException('Maker-checker payload missing loan_id');
        }

        $loan = $this->loanRepo->find($loanId);
        if ($loan === null) {
            throw new DomainException('Loan not found (may have been deleted)');
        }

        $settlementGlId = $payload['settlement_gl_id'] ?? '';
        if ($settlementGlId === '') {
            throw new DomainException('Maker-checker payload missing settlement_gl_id');
        }

        $effectiveDate = $payload['effective_date'] ?? date('Y-m-d');
        $topUp = $payload['top_up_balance'] ?? null;

        // DisbursementService already guards loan.status === APPROVED
        // and opens its own transaction — safe to call here directly.
        // The checker becomes the attributed user for GL audit trails.
        return $this->disbursementService->disburse(
            $loan,
            $settlementGlId,
            $effectiveDate,
            $checker->getId(),
            $topUp === null || $topUp === '' ? null : (string) $topUp,
        );
    }

    /**
     * Execute a pending journal reversal.
     *
     * Expected payload keys (matches ReversalAction's capture):
     *   - transaction_id
     *   - reason
     */
    private function executeReversal(array $payload, User $checker): array
    {
        $transactionId = $payload['transaction_id'] ?? '';
        if ($transactionId === '') {
            throw new DomainException('Maker-checker payload missing transaction_id');
        }
        $reason = $payload['reason'] ?? 'Reversal approved via maker-checker';
        return $this->reversalService->reverse($transactionId, $checker->getId(), $reason);
    }

    /**
     * Execute a pending loan write-off.
     *
     * Re-fetches the loan rather than trusting any cached state from
     * the maker submission — the loan's status may have changed in the
     * interval (e.g. someone else closed it normally, or the borrower
     * came back and paid). LoanLifecycleService::writeOff() runs its
     * own status validation; if the loan is no longer write-off-eligible,
     * the checker gets a clear error.
     *
     * Expected payload keys (matches WriteOffLoanAction's capture):
     *   - loan_id
     *   - reason
     */
    private function executeWriteOff(array $payload, User $checker): array
    {
        $loanId = $payload['loan_id'] ?? '';
        if ($loanId === '') {
            throw new DomainException('Maker-checker payload missing loan_id');
        }

        $loan = $this->loanRepo->find($loanId);
        if ($loan === null) {
            throw new DomainException('Loan not found (may have been deleted)');
        }

        $reason = $payload['reason'] ?? null;
        return $this->lifecycleService->writeOff($loan, $reason, $checker->getId());
    }
}
