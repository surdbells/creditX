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
        private readonly LoanRepository $loanRepo,
        private readonly EntityManagerInterface $em,
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
            default => throw new DomainException(
                "Maker-checker execution not implemented for operation type: {$opType}"
            ),
        };
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
}
