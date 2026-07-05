<?php
declare(strict_types=1);
namespace App\Action\Approval;

use App\Domain\Repository\LoanRepository;
use App\Infrastructure\Service\{ApiResponse, LoanCalculationService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GET /api/approvals/loan/{id}/recalculate?top_up_balance=X
 *
 * Underwriter preview: recompute the loan with a hypothetical top-up /
 * outstanding balance (e.g. an unmigrated legacy loan) so the underwriter can
 * review the effect on the net disbursement before approving. Read-only —
 * persists nothing. Gated by loans.approve (same as the approval decision).
 */
final class RecalculateLoanAction
{
    use ApiResponse;

    public function __construct(
        private readonly LoanRepository $loanRepo,
        private readonly LoanCalculationService $calcService,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $loan = $this->loanRepo->find($args['id'] ?? '');
        if ($loan === null) return $this->notFound('Loan not found');

        $raw = (string) ($request->getQueryParams()['top_up_balance'] ?? '0');
        $cleaned = preg_replace('/[^0-9.]/', '', $raw);
        $topUp = number_format(max(0.0, (float) ($cleaned !== '' ? $cleaned : '0')), 2, '.', '');

        $product = $loan->getProduct();
        $amount  = $loan->getAmountRequested();
        $tenure  = $loan->getTenure();
        $mode    = $loan->getBankStatementMode();

        // Baseline (no top-up) so the UI can show "was → now".
        $base = $this->calcService->calculate($product, $amount, $tenure, $mode, '0');
        $calc = $this->calcService->calculate($product, $amount, $tenure, $mode, $topUp);

        return $this->success([
            'amount_requested'     => $amount,
            'top_up_balance'       => $topUp,
            'tenure'               => $tenure,
            'gross_loan'           => $calc['gross_loan'],
            'total_fees'           => $calc['total_fees'],
            // Only the net disbursement changes with a top-up; the repayment
            // schedule is on the full loan and is unaffected.
            'net_disbursed_before' => $base['net_disbursed'],
            'net_disbursed'        => $calc['net_disbursed'],
            'monthly_repayment'    => $calc['mr_principal_interest'],
            'total_repayment'      => $calc['tr_principal_interest'],
        ]);
    }
}
