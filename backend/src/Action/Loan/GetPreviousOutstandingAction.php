<?php
declare(strict_types=1);
namespace App\Action\Loan;

use App\Domain\Entity\Loan;
use App\Domain\Entity\RepaymentSchedule;
use App\Domain\Repository\LoanRepository;
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GET /api/loans/{id}/previous-outstanding
 *
 * Returns the computed outstanding balance on this loan's PREVIOUS
 * loan — used by the underwriter approval form to auto-prefill the
 * top-up balance field when reviewing a top-up loan.
 *
 * Computation: sum of (total_amount - paid_amount) across all unpaid
 * schedule rows on the previous loan. This mirrors how outstanding
 * balance is displayed elsewhere in the admin (schedules are the
 * authoritative source of what's owed, not the customer ledger —
 * which is a wash account for disbursement mechanics).
 *
 * Response shape:
 *   { status: 'success',
 *     data: {
 *       has_previous: bool,
 *       previous_loan_id: string|null,
 *       previous_application_id: string|null,
 *       outstanding: string,          // '0.00' if none / no previous
 *       paid_principal: string,
 *       unpaid_count: int,
 *       latest_paid_at: string|null,  // ISO date
 *     } }
 *
 * Empty-case behaviour: if the loan has no previous_loan_id (fresh
 * new loan, not a top-up), returns has_previous=false and all
 * numeric fields zeroed. That way the frontend doesn't need to
 * special-case missing data.
 *
 * Gated by loans.view (same as regular loan fetch).
 */
final class GetPreviousOutstandingAction
{
    use ApiResponse;

    public function __construct(
        private readonly LoanRepository $loanRepo,
        private readonly EntityManagerInterface $em,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $loan = $this->loanRepo->find($args['id'] ?? '');
        if ($loan === null) return $this->notFound('Loan not found');

        $prevId = $loan->getPreviousLoanId();
        if ($prevId === null) {
            return $this->success([
                'has_previous'             => false,
                'previous_loan_id'         => null,
                'previous_application_id'  => null,
                'outstanding'              => '0.00',
                'paid_principal'           => '0.00',
                'unpaid_count'             => 0,
                'latest_paid_at'           => null,
            ]);
        }

        $previous = $this->em->find(Loan::class, $prevId);
        if ($previous === null) {
            // Data inconsistency — previous_loan_id points nowhere.
            // Don't error, just tell the frontend there's nothing
            // useful to auto-prefill so the underwriter types the
            // value manually.
            return $this->success([
                'has_previous'             => false,
                'previous_loan_id'         => $prevId,
                'previous_application_id'  => null,
                'outstanding'              => '0.00',
                'paid_principal'           => '0.00',
                'unpaid_count'             => 0,
                'latest_paid_at'           => null,
            ]);
        }

        // Aggregate over repayment_schedules. We sum (total_amount -
        // paid_amount) rather than filtering to specific statuses so
        // partially-paid rows count correctly. Skip WAIVED rows —
        // those are explicit write-offs during top-up rollover (see
        // DisbursementService step 7) and shouldn't count toward
        // the new top-up.
        $conn = $this->em->getConnection();
        $row = $conn->fetchAssociative(
            "SELECT
                COALESCE(SUM(total_amount - COALESCE(paid_amount, 0)), 0) AS outstanding,
                COALESCE(SUM(COALESCE(paid_amount, 0)), 0) AS paid_total,
                SUM(CASE WHEN status IN ('pending','partial','overdue') THEN 1 ELSE 0 END) AS unpaid_count,
                MAX(paid_at) AS latest_paid_at
             FROM repayment_schedules
             WHERE loan_id = :loan_id
               AND status != 'waived'",
            ['loan_id' => $prevId],
        );

        return $this->success([
            'has_previous'             => true,
            'previous_loan_id'         => $prevId,
            'previous_application_id'  => $previous->getApplicationId(),
            'outstanding'              => number_format((float) $row['outstanding'], 2, '.', ''),
            'paid_principal'           => number_format((float) $row['paid_total'], 2, '.', ''),
            'unpaid_count'             => (int) $row['unpaid_count'],
            'latest_paid_at'           => $row['latest_paid_at'],
        ]);
    }
}
