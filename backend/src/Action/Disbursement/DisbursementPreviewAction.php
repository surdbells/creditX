<?php
declare(strict_types=1);
namespace App\Action\Disbursement;

use App\Domain\Enum\AccountType;
use App\Domain\Enum\LoanStatus;
use App\Domain\Repository\{LoanRepository, GeneralLedgerRepository, RepaymentScheduleRepository};
use App\Infrastructure\Service\{ApiResponse, LoanCalculationService};
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Disbursement preview endpoint.
 *
 * Returns everything the disbursement dialog needs to render a full
 * loan preview + guided top-up handling + settlement GL selection,
 * all without committing any changes. Mirrors the agent app's loan
 * calculator output shape so the admin dialog can reuse the same
 * preview panel.
 *
 * Response shape:
 *   {
 *     loan: { ... full toArray with true (include relations) },
 *     calculation: {
 *       gross_loan, total_fees, net_disbursed,
 *       mr_principal, mr_interest, mr_principal_interest,
 *       fee_details: [...],
 *       schedule_preview: [...],  // tenure-length array
 *     },
 *     top_up: {
 *       auto_detected: bool,
 *       balance: string,          // '0.00' if none detected
 *       source_loan: { application_id, id, outstanding } | null,
 *       message: string,          // human-readable hint for the UI
 *     },
 *     settlement_gls: [           // ASSET accounts the admin can pick
 *       { id, name, code, account_type }, ...
 *     ],
 *   }
 *
 * The 'top_up.balance' is the CURRENT outstanding balance from the
 * customer's most recent active/overdue/restructured loan — re-computed
 * at preview time rather than relying on the stale value captured when
 * the loan was originally submitted (which may be months out of date
 * if the approval workflow took a while and the customer kept paying
 * down their prior loan in the meantime).
 */
final class DisbursementPreviewAction
{
    use ApiResponse;

    public function __construct(
        private readonly LoanRepository $loanRepo,
        private readonly GeneralLedgerRepository $glRepo,
        private readonly RepaymentScheduleRepository $scheduleRepo,
        private readonly LoanCalculationService $calcService,
        private readonly EntityManagerInterface $em,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $loan = $this->loanRepo->find($args['id'] ?? '');
        if ($loan === null) return $this->notFound('Loan not found');

        // Re-detect top-up balance from the customer's prior loans. We
        // consider a loan 'still owing' if it's in DISBURSED / ACTIVE /
        // OVERDUE / RESTRUCTURED state — any status where the repayment
        // schedule has unpaid rows.
        $topUp = $this->detectTopUpBalance($loan);

        // Re-run the calculation with the fresh top-up balance. This
        // is the same calculation the capture form ran — we just pass
        // the newly-detected balance instead of the stale captured one.
        $calc = $this->calcService->calculate(
            $loan->getProduct(),
            $loan->getAmountRequested(),
            $loan->getTenure(),
            $loan->getBankStatementMode(),
            $topUp['balance'],
        );

        // Settlement GL options — ASSET accounts (bank/cash) the admin
        // can pick as the source of funds for the disbursement.
        $settlementGls = array_map(
            fn($gl) => [
                'id'           => $gl->getId(),
                'name'         => $gl->getAccountName(),
                'code'         => $gl->getAccountCode(),
                'account_type' => $gl->getAccountType()->value,
            ],
            $this->glRepo->findByAccountType(AccountType::ASSET),
        );

        return $this->success([
            'loan'           => $loan->toArray(true),
            'calculation'    => $calc,
            'top_up'         => $topUp,
            'settlement_gls' => $settlementGls,
        ]);
    }

    /**
     * Detect current outstanding balance from the customer's other
     * active loans. Sums (total_amount - paid_amount) across all
     * RepaymentSchedule rows for loans in statuses that still owe
     * money. Excludes the loan being disbursed to avoid self-reference.
     *
     * @return array{auto_detected: bool, balance: string, source_loan: array|null, message: string}
     */
    private function detectTopUpBalance(\App\Domain\Entity\Loan $loan): array
    {
        $customerId = $loan->getCustomer()->getId();
        $loanId = $loan->getId();

        // Find loans still owing money — all statuses where a payment
        // obligation remains. CLOSED / WRITTEN_OFF are excluded because
        // their balances are settled from the bank's perspective, even
        // if there are residual schedule rows for audit purposes.
        $owingStatuses = [
            LoanStatus::DISBURSED->value,
            LoanStatus::ACTIVE->value,
            LoanStatus::OVERDUE->value,
            LoanStatus::RESTRUCTURED->value,
        ];

        $priorLoans = $this->em->createQueryBuilder()
            ->select('l')
            ->from(\App\Domain\Entity\Loan::class, 'l')
            ->where('l.customer = :customerId')
            ->andWhere('l.id != :loanId')
            ->andWhere('l.status IN (:statuses)')
            ->orderBy('l.createdAt', 'DESC')
            ->setParameter('customerId', $customerId)
            ->setParameter('loanId', $loanId)
            ->setParameter('statuses', $owingStatuses)
            ->getQuery()
            ->getResult();

        if (empty($priorLoans)) {
            return [
                'auto_detected' => false,
                'balance'       => '0.00',
                'source_loan'   => null,
                'message'       => 'No prior active loans found for this customer. Enter a top-up balance manually if needed.',
            ];
        }

        // The most-recent prior loan is our top-up source. A customer
        // typically only has one active loan at a time, but if there
        // are multiple owing loans we still pick the newest and sum
        // only its outstanding balance — rolling up multiple loans'
        // balances into one disbursement is rare and best handled as
        // a manual override in the UI.
        $sourceLoan = $priorLoans[0];
        $outstanding = $this->scheduleRepo->sumOutstandingByLoan($sourceLoan->getId());

        return [
            'auto_detected' => true,
            'balance'       => number_format((float) $outstanding, 2, '.', ''),
            'source_loan'   => [
                'id'             => $sourceLoan->getId(),
                'application_id' => $sourceLoan->getApplicationId(),
                'status'         => $sourceLoan->getStatus()->value,
                'outstanding'    => number_format((float) $outstanding, 2, '.', ''),
            ],
            'message'       => sprintf(
                'Outstanding balance of ₦%s automatically detected from loan %s. Adjust manually if this does not match records.',
                number_format((float) $outstanding, 2, '.', ','),
                $sourceLoan->getApplicationId(),
            ),
        ];
    }
}
