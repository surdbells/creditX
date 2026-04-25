<?php

declare(strict_types=1);

namespace App\Action\Disbursement;

use App\Domain\Entity\Loan;
use App\Domain\Enum\LoanStatus;
use App\Domain\Repository\LoanRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Batch disburse — preview-only endpoint.
 *
 * Same input shape as BatchDisburseAction but commits nothing. Returns
 * a per-loan validation summary so operators can review the batch
 * before pulling the trigger on real money movements.
 *
 * Contract:
 *   POST /api/disbursement/batch/preview
 *   Body: {
 *     loan_ids?: string[],
 *     application_ids?: string[],
 *   }
 *   Response data: {
 *     items: [
 *       {
 *         loan_id, application_id, customer_name, amount_requested,
 *         net_disbursed, status,
 *         can_disburse: boolean,
 *         reason: string | null  // present when can_disburse is false
 *       },
 *       ...
 *     ],
 *     summary: {
 *       total: int,
 *       ready: int,         // can_disburse = true
 *       blocked: int,       // can_disburse = false
 *       not_found: int,     // resolution failures
 *     }
 *   }
 *
 * The validation surface is intentionally narrow — only checks that
 * are cheap and don't require side-effects (status check, no document
 * fetch, no period-close re-evaluation). Heavier validation
 * (closed-period guard, GL existence, etc) only fires at actual
 * disburse time inside DisbursementService.disburse(); operators
 * see those failures in the post-submit results panel rather than
 * the preview. That trade-off keeps the preview snappy on a 50-loan
 * batch (one query, one resolution pass, no transactions).
 */
final class BatchDisbursePreviewAction
{
    use ApiResponse;

    public function __construct(
        private readonly LoanRepository $loanRepo,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = (array) ($request->getParsedBody() ?? []);

        [$resolved, $unresolved] = BatchIdResolver::resolve(
            $this->loanRepo,
            (array) ($data['loan_ids'] ?? []),
            (array) ($data['application_ids'] ?? []),
        );

        $items = [];

        // Resolved loans — check each can actually disburse.
        foreach ($resolved as $loan) {
            /** @var Loan $loan */
            $items[] = $this->validateLoan($loan);
        }

        // Unresolved — surface as not-found items so the UI can render
        // them in the same list with a clear reason.
        foreach ($unresolved as $unr) {
            $items[] = [
                'loan_id'          => $unr['loan_id']        ?? null,
                'application_id'   => $unr['application_id'] ?? null,
                'customer_name'    => null,
                'amount_requested' => null,
                'net_disbursed'    => null,
                'status'           => null,
                'can_disburse'     => false,
                'reason'           => 'Loan not found',
            ];
        }

        $ready   = count(array_filter($items, fn(array $i): bool => $i['can_disburse']));
        $blocked = count(array_filter($items, fn(array $i): bool => !$i['can_disburse'] && $i['reason'] !== 'Loan not found'));
        $notFound = count($unresolved);

        return $this->success([
            'items'   => $items,
            'summary' => [
                'total'     => count($items),
                'ready'     => $ready,
                'blocked'   => $blocked,
                'not_found' => $notFound,
            ],
        ]);
    }

    /**
     * Validate a single loan for disbursement readiness.
     * Returns a uniformly-shaped row regardless of pass/fail.
     *
     * @return array<string, mixed>
     */
    private function validateLoan(Loan $loan): array
    {
        $status = $loan->getStatus();

        if ($status !== LoanStatus::APPROVED) {
            $reason = $status === LoanStatus::DISBURSED
                ? 'Already disbursed'
                : sprintf('Status is %s — must be Approved', $status->value);

            return [
                'loan_id'          => $loan->getId(),
                'application_id'   => $loan->getApplicationId(),
                'customer_name'    => $loan->getCustomer()->getFullName(),
                'amount_requested' => $loan->getAmountRequested(),
                'net_disbursed'    => $loan->getNetDisbursed(),
                'status'           => $status->value,
                'can_disburse'     => false,
                'reason'           => $reason,
            ];
        }

        // Approved and ready — sanity-check the loan has a transaction
        // record (without it, DisbursementService throws). Cheap check
        // since the relation is already loaded once we have the Loan.
        if ($loan->getTransaction() === null) {
            return [
                'loan_id'          => $loan->getId(),
                'application_id'   => $loan->getApplicationId(),
                'customer_name'    => $loan->getCustomer()->getFullName(),
                'amount_requested' => $loan->getAmountRequested(),
                'net_disbursed'    => $loan->getNetDisbursed(),
                'status'           => $status->value,
                'can_disburse'     => false,
                'reason'           => 'Loan transaction record missing',
            ];
        }

        return [
            'loan_id'          => $loan->getId(),
            'application_id'   => $loan->getApplicationId(),
            'customer_name'    => $loan->getCustomer()->getFullName(),
            'amount_requested' => $loan->getAmountRequested(),
            'net_disbursed'    => $loan->getNetDisbursed(),
            'status'           => $status->value,
            'can_disburse'     => true,
            'reason'           => null,
        ];
    }
}
