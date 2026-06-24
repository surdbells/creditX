<?php

declare(strict_types=1);

namespace App\Action\Portal;

use App\Domain\Entity\{Loan, LoanFeeBreakdown, LoanTrail, LoanTransaction};
use App\Domain\Enum\{EmploymentType, FeeCalculationType, LoanStatus, LoanType};
use App\Domain\Repository\{CustomerRepository, LoanProductRepository, LoanRepository};
use App\Infrastructure\Service\{AffordabilityService, ApiResponse, ApprovalEngineService, InputValidator, LoanCalculationService};
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Customer self-service loan application (POST /api/portal/loans).
 *
 * Unlike the agent CreateLoanAction, the customer is already known (resolved
 * from the portal token) and there is no agent or branch. A customer-submitted
 * application goes straight to SUBMITTED status and immediately enters the
 * approval workflow — there is no DRAFT/CAPTURED staging step.
 *
 * A customer may only have one application in progress at a time.
 */
final class ApplyLoanAction
{
    use ApiResponse;

    /** Statuses that count as an in-flight application for the one-at-a-time guard. */
    private const IN_PROGRESS = [
        LoanStatus::DRAFT, LoanStatus::CAPTURED, LoanStatus::SUBMITTED,
        LoanStatus::UNDER_REVIEW, LoanStatus::APPROVED,
    ];

    public function __construct(
        private readonly LoanRepository $loanRepo,
        private readonly CustomerRepository $customerRepo,
        private readonly LoanProductRepository $productRepo,
        private readonly LoanCalculationService $calcService,
        private readonly ApprovalEngineService $approvalEngine,
        private readonly AffordabilityService $affordability,
        private readonly EntityManagerInterface $em,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $customerId = (string) $request->getAttribute('customer_id');
        $customer = $this->customerRepo->find($customerId);
        if ($customer === null) {
            return $this->notFound('Account not found');
        }

        $data = (array) ($request->getParsedBody() ?? []);

        $v = InputValidator::validate($data, [
            'product_id'      => ['required' => true, 'type' => 'string'],
            'amount'          => ['required' => true, 'type' => 'string'],
            'tenure'          => ['required' => true, 'type' => 'int', 'min' => 1],
            'loan_purpose'    => ['required' => false, 'type' => 'string', 'max' => 500],
            'employment_type' => ['required' => true, 'type' => 'string', 'max' => 20],
            'monthly_income'  => ['required' => true, 'type' => 'string'],
            'employer'        => ['required' => false, 'type' => 'string', 'max' => 200],
            'job_title'       => ['required' => false, 'type' => 'string', 'max' => 100],
            'business_name'   => ['required' => false, 'type' => 'string', 'max' => 200],
        ]);
        if (!empty($v['errors'])) {
            return $this->validationError($v['errors']);
        }
        $c = $v['clean'];

        // ─── Employment & income (affordability basis) ───
        // The portal serves any individual, including the self-employed, so
        // income is self-declared here rather than read from a government
        // record. Income is required; a thin DSR breach is soft-flagged, not
        // blocked (see further below).
        $errors = [];
        $employmentType = strtoupper(trim((string) ($c['employment_type'] ?? '')));
        if (!in_array($employmentType, EmploymentType::values(), true)) {
            $errors['employment_type'] = 'Select a valid employment type.';
        }
        $monthlyIncome = (float) ($c['monthly_income'] ?? 0);
        if ($monthlyIncome <= 0) {
            $errors['monthly_income'] = 'Enter a valid monthly income.';
        }
        $employer = trim((string) ($c['employer'] ?? ''));
        $businessName = trim((string) ($c['business_name'] ?? ''));
        if ($employmentType === EmploymentType::EMPLOYED->value && $employer === '') {
            $errors['employer'] = 'Employer is required for employed applicants.';
        }
        if (in_array($employmentType, [EmploymentType::SELF_EMPLOYED->value, EmploymentType::BUSINESS_OWNER->value], true)
            && $businessName === '') {
            $errors['business_name'] = 'Business name is required for self-employed applicants.';
        }
        if (!empty($errors)) {
            return $this->validationError($errors);
        }

        // One application at a time.
        foreach ($this->loanRepo->findActiveByCustomer($customerId) as $existing) {
            if (in_array($existing->getStatus(), self::IN_PROGRESS, true)) {
                return $this->error('You already have a loan application in progress.', 409);
            }
        }

        $product = $this->productRepo->find($c['product_id']);
        if ($product === null) {
            return $this->notFound('Loan product not found');
        }
        if (!$product->isActive()) {
            return $this->error('This loan product is not currently available.', 400);
        }
        if ((float) $c['amount'] < (float) $product->getMinAmount() || (float) $c['amount'] > (float) $product->getMaxAmount()) {
            return $this->validationError(['amount' => "Amount must be between {$product->getMinAmount()} and {$product->getMaxAmount()}"]);
        }
        if ($c['tenure'] < $product->getMinTenure() || $c['tenure'] > $product->getMaxTenure()) {
            return $this->validationError(['tenure' => "Tenure must be between {$product->getMinTenure()} and {$product->getMaxTenure()}"]);
        }

        $calc = $this->calcService->calculate($product, $c['amount'], $c['tenure'], null, '0');

        // Persist the declared employment/income onto the customer profile so
        // it carries forward and a reviewer can see it. Income reuses the
        // existing gross_pay column (single source of truth for monthly pay).
        $customer->fillFromArray([
            'employment_type' => $employmentType,
            'gross_pay'       => sprintf('%.2f', $monthlyIncome),
            'employer'        => $employer !== '' ? $employer : null,
            'job_title'       => !empty($c['job_title']) ? $c['job_title'] : null,
            'business_name'   => $businessName !== '' ? $businessName : null,
        ]);

        // Affordability: monthly instalment vs declared income. Soft-flagged —
        // a breach still submits, with the snapshot frozen on the loan.
        $affordability = $this->affordability->assess($monthlyIncome, $calc['mr_principal_interest']);

        $this->em->beginTransaction();
        try {
            $loan = new Loan();
            $loan->setApplicationId(Loan::generateApplicationId());
            $loan->setCustomer($customer);
            $loan->setProduct($product);
            $loan->setAmountRequested($c['amount']);
            $loan->setTenure($c['tenure']);
            $loan->setGrossLoan($calc['gross_loan']);
            $loan->setNetDisbursed($calc['net_disbursed']);
            $loan->setInterestRate($product->getInterestRate());
            $loan->setCalculationMethod($product->getInterestCalculationMethod());
            $loan->setStatus(LoanStatus::SUBMITTED);
            $loan->setLoanType(LoanType::NEW_LOAN);
            $loan->setApplicantMonthlyIncome(sprintf('%.2f', $monthlyIncome));
            if ($affordability['dsr'] !== null) {
                $loan->setDsr(sprintf('%.6f', $affordability['dsr']));
            }
            if (!empty($c['loan_purpose'])) {
                $loan->setLoanPurpose($c['loan_purpose']);
            }

            $tx = new LoanTransaction();
            $tx->setLoan($loan);
            $tx->setAppAmount($c['amount']);
            $tx->setGrossLoan($calc['gross_loan']);
            $tx->setTotalFees($calc['total_fees']);
            $tx->setMrPrincipal($calc['mr_principal']);
            $tx->setMrInterest($calc['mr_interest']);
            $tx->setTrPrincipal($calc['tr_principal']);
            $tx->setTrInterest($calc['tr_interest']);
            $tx->setMrPrincipalInterest($calc['mr_principal_interest']);
            $tx->setTrPrincipalInterest($calc['tr_principal_interest']);
            $tx->setNetDisbursed($calc['net_disbursed']);
            $tx->setTopUpBalance('0');
            $tx->setLoanTenure($c['tenure']);
            $loan->setTransaction($tx);

            foreach ($calc['fee_details'] as $fd) {
                $feeType = $this->em->getRepository(\App\Domain\Entity\FeeType::class)->find($fd['fee_type_id']);
                if (!$feeType) {
                    continue;
                }
                $fb = new LoanFeeBreakdown();
                $fb->setFeeType($feeType);
                $fb->setAmount($fd['amount']);
                $fb->setCalculationType(FeeCalculationType::from($fd['calculation_type']));
                $fb->setBaseValue($fd['base_value']);
                $fb->setIsDeducted($fd['is_deducted']);
                $loan->addFeeBreakdown($fb);
            }

            $trail = new LoanTrail();
            $trail->setUserId($customerId);
            $trail->setAction('Loan application submitted via customer portal');
            $trail->setDetails([
                'status'                     => LoanStatus::SUBMITTED->value,
                'amount'                     => $c['amount'],
                'tenure'                     => $c['tenure'],
                'employment_type'            => $employmentType,
                'monthly_income'             => $affordability['monthly_income'],
                'monthly_installment'        => $affordability['monthly_installment'],
                'dsr'                        => $affordability['dsr'],
                'max_dsr'                    => $affordability['max_dsr'],
                'within_affordability_limit' => $affordability['within_limit'],
            ]);
            $trail->setIpAddress($this->getClientIp($request));
            $loan->addTrail($trail);

            $this->em->persist($loan);
            $this->em->persist($tx);
            $this->em->flush();
            $this->em->commit();
        } catch (\Throwable $e) {
            if ($this->em->getConnection()->isTransactionActive()) {
                $this->em->rollback();
            }
            throw $e;
        }

        // Kick off the approval workflow. If none is configured the loan
        // stays SUBMITTED for manual handling — best-effort, never fatal.
        try {
            $this->approvalEngine->initiate($loan);
            $this->em->flush();
        } catch (\App\Domain\Exception\DomainException) {
            // No workflow configured — leave SUBMITTED for staff to action.
        }

        $payload = $loan->toArray(true);
        $payload['affordability'] = $affordability;

        return $this->created($payload, 'Your loan application has been submitted.');
    }
}
