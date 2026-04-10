<?php
declare(strict_types=1);
namespace App\Action\Loan;

use App\Domain\Entity\{Loan, LoanFeeBreakdown, LoanTrail, LoanTransaction};
use App\Domain\Enum\{FeeCalculationType, LoanStatus, LoanType};
use App\Domain\Repository\{CustomerRepository, LoanProductRepository, LoanRepository, LocationRepository};
use App\Infrastructure\Service\{ApiResponse, AuditService, InputValidator, LoanCalculationService};
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class CreateLoanAction
{
    use ApiResponse;
    public function __construct(
        private readonly LoanRepository $loanRepo,
        private readonly CustomerRepository $customerRepo,
        private readonly LoanProductRepository $productRepo,
        private readonly LocationRepository $locationRepo,
        private readonly LoanCalculationService $calcService,
        private readonly AuditService $audit,
        private readonly EntityManagerInterface $em,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = (array) ($request->getParsedBody() ?? []);
        $v = InputValidator::validate($data, [
            'customer_id' => ['required' => true, 'type' => 'string'],
            'product_id'  => ['required' => true, 'type' => 'string'],
            'amount'      => ['required' => true, 'type' => 'string'],
            'tenure'      => ['required' => true, 'type' => 'int', 'min' => 1],
            'branch_id'   => ['required' => false, 'type' => 'string'],
            'bank_statement_mode' => ['required' => false, 'type' => 'string'],
        ]);
        if (!empty($v['errors'])) return $this->validationError($v['errors']);
        $c = $v['clean'];

        $customer = $this->customerRepo->find($c['customer_id']);
        if ($customer === null) return $this->notFound('Customer not found');

        $product = $this->productRepo->find($c['product_id']);
        if ($product === null) return $this->notFound('Loan product not found');
        if (!$product->isActive()) return $this->error('Loan product is inactive', 400);

        // Validate limits
        if ((float) $c['amount'] < (float) $product->getMinAmount() || (float) $c['amount'] > (float) $product->getMaxAmount()) {
            return $this->validationError(['amount' => "Amount must be between {$product->getMinAmount()} and {$product->getMaxAmount()}"]);
        }
        if ($c['tenure'] < $product->getMinTenure() || $c['tenure'] > $product->getMaxTenure()) {
            return $this->validationError(['tenure' => "Tenure must be between {$product->getMinTenure()} and {$product->getMaxTenure()}"]);
        }

        // Check for in-progress loans
        $staffId = $customer->getStaffId();
        if ($staffId && $this->loanRepo->hasInProgressLoanForStaffId($staffId)) {
            return $this->error('Customer already has a loan application in progress', 400);
        }

        // Detect top-up
        $loanType = LoanType::NEW_LOAN;
        $topUpBalance = '0';
        if ($staffId && $product->allowsTopUp()) {
            $disbursed = $this->loanRepo->findDisbursedByStaffId($staffId);
            if (!empty($disbursed)) {
                $loanType = LoanType::TOP_UP;
                // For now, top-up balance will be set manually or calculated in Phase 5
                $topUpBalance = $data['top_up_balance'] ?? '0';
            }
        }

        // Calculate loan
        $calc = $this->calcService->calculate($product, $c['amount'], $c['tenure'], $c['bank_statement_mode'] ?? null, $topUpBalance);

        // Determine initial status
        $userId = $request->getAttribute('user_id');
        $userRoles = $request->getAttribute('user_roles', []);
        $isAgent = in_array('agent', $userRoles, true);
        $initialStatus = $isAgent ? LoanStatus::CAPTURED : LoanStatus::DRAFT;

        // Create loan
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
        $loan->setStatus($initialStatus);
        $loan->setLoanType($loanType);
        $loan->setBankStatementMode($c['bank_statement_mode'] ?? null);
        $loan->setTopUpBalance($topUpBalance !== '0' ? $topUpBalance : null);

        if (isset($c['branch_id']) && $c['branch_id']) {
            $branch = $this->locationRepo->find($c['branch_id']);
            if ($branch) $loan->setBranch($branch);
        }

        // Set agent from user context
        $agentRepo = $this->em->getRepository(\App\Domain\Entity\User::class);
        $agentUser = $agentRepo->find($userId);
        if ($agentUser && $isAgent) {
            $loan->setAgent($agentUser);
        }

        // Create loan transaction
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
        $tx->setTopUpBalance($topUpBalance);
        $tx->setLoanTenure($c['tenure']);
        $loan->setTransaction($tx);

        // Create fee breakdowns
        foreach ($calc['fee_details'] as $fd) {
            $fb = new LoanFeeBreakdown();
            $feeType = $this->em->getRepository(\App\Domain\Entity\FeeType::class)->find($fd['fee_type_id']);
            if (!$feeType) continue;
            $fb->setFeeType($feeType);
            $fb->setAmount($fd['amount']);
            $fb->setCalculationType(FeeCalculationType::from($fd['calculation_type']));
            $fb->setBaseValue($fd['base_value']);
            $fb->setIsDeducted($fd['is_deducted']);
            $loan->addFeeBreakdown($fb);
        }

        // Trail entry
        $trail = new LoanTrail();
        $trail->setUserId($userId);
        $trail->setAction('Loan application created');
        $trail->setDetails(['status' => $initialStatus->value, 'amount' => $c['amount'], 'tenure' => $c['tenure']]);
        $trail->setIpAddress($this->getClientIp($request));
        $loan->addTrail($trail);

        $this->em->persist($loan);
        $this->em->persist($tx);
        $this->em->flush();

        $this->audit->logCreate($userId, 'Loan', $loan->getId(), $loan->toArray(), $this->getClientIp($request), $this->getUserAgent($request));
        return $this->created($loan->toArray(true), 'Loan application created successfully');
    }
}
