<?php
declare(strict_types=1);
namespace App\Action\Loan;

use App\Domain\Entity\{Customer, Loan, LoanFeeBreakdown, LoanTrail, LoanTransaction, NextOfKin};
use App\Domain\Enum\{FeeCalculationType, LoanStatus, LoanType};
use App\Domain\Repository\{CustomerRepository, LoanProductRepository, LoanRepository, LocationRepository};
use App\Infrastructure\Service\{ApiResponse, AuditService, InputValidator, LoanCalculationService, NotificationDispatchService, SettingsCacheService};
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * POST /api/loans — create a loan application.
 *
 * Supports two customer flows in one endpoint:
 *
 *   1. Existing customer (agent looked up by IPPIS, customer found):
 *      payload includes 'customer_id'. The customer row is loaded,
 *      optional 'customer' block patches any updated fields.
 *
 *   2. New customer (IPPIS not found):
 *      payload includes nested 'customer' object (full_name, phone, etc.)
 *      We create the Customer row, attach any 'next_of_kin', and use
 *      the new ID for the loan.
 *
 * Exactly one of {customer_id, customer} must be provided. If both are
 * present, customer_id wins and 'customer' is treated as a patch payload.
 *
 * The whole thing runs in a transaction — if the loan creation fails
 * after customer creation, we roll back the customer too. No orphan
 * Customer rows in the happy-path failure modes.
 */
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
        private readonly NotificationDispatchService $notifService,
        private readonly SettingsCacheService $settings,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        // Pause guard — the 'agent.accepting_loans' setting is the admin's
        // kill-switch for new applications. Check BEFORE parsing the payload
        // so we fail fast and give the client a clear 403 rather than a
        // generic validation error. SettingsCacheService hits Redis first
        // (hot path) so this is effectively free.
        //
        // Setting default is true — if the setting has never been created,
        // intake is OPEN. Admin has to explicitly pause.
        if (!$this->settings->getBool('agent.accepting_loans', true)) {
            return $this->forbidden('Loan applications are currently paused by the administrator. Please try again later.');
        }

        $data = (array) ($request->getParsedBody() ?? []);

        // Pre-validate the identification mode — either customer_id OR customer payload
        $hasCustomerId = isset($data['customer_id']) && is_string($data['customer_id']) && $data['customer_id'] !== '';
        $customerPayload = (isset($data['customer']) && is_array($data['customer'])) ? $data['customer'] : null;

        if (!$hasCustomerId && $customerPayload === null) {
            return $this->validationError([
                'customer' => 'Either customer_id or customer object must be provided',
            ]);
        }

        // Core loan fields
        $v = InputValidator::validate($data, [
            'product_id'  => ['required' => true, 'type' => 'string'],
            'amount'      => ['required' => true, 'type' => 'string'],
            'tenure'      => ['required' => true, 'type' => 'int', 'min' => 1],
            'branch_id'   => ['required' => false, 'type' => 'string'],
            'bank_statement_mode' => ['required' => false, 'type' => 'string'],
            // Optional loan-level metadata captured on the application form
            'loan_amount_words' => ['required' => false, 'type' => 'string'],
            'loan_purpose'      => ['required' => false, 'type' => 'string'],
            'repayment_method'  => ['required' => false, 'type' => 'string'],
            'account_statement_id'       => ['required' => false, 'type' => 'string'],
            'account_statement_password' => ['required' => false, 'type' => 'string'],
        ]);
        if (!empty($v['errors'])) return $this->validationError($v['errors']);
        $c = $v['clean'];

        // Open a single transaction wrapping customer create/update + loan create
        $this->em->beginTransaction();
        try {
            // ─── Resolve / create customer ───────────────────────────
            if ($hasCustomerId) {
                $customer = $this->customerRepo->find($data['customer_id']);
                if ($customer === null) {
                    $this->em->rollback();
                    return $this->notFound('Customer not found');
                }
                // Patch any updated fields. This is how the wizard keeps the
                // customer record fresh when an existing customer's info has
                // changed since their last loan (new address, new phone, etc).
                if ($customerPayload !== null) {
                    $customer->fillFromArray($customerPayload);
                }
            } else {
                // New customer path. 'full_name' is the only truly required
                // field on Customer (it's non-nullable). Everything else is
                // optional and can be filled later.
                if (empty($customerPayload['full_name'])) {
                    $this->em->rollback();
                    return $this->validationError([
                        'customer.full_name' => 'Full name is required for new customers',
                    ]);
                }
                $customer = new Customer();
                $customer->setFullName($customerPayload['full_name']);
                $customer->fillFromArray($customerPayload);
                $this->em->persist($customer);
            }

            // ─── Next of kin (optional; attached to customer) ───────
            // Accepted as an array so we can later support multiple NOKs.
            // For now the wizard sends a single-element array for the one
            // NOK captured on screen 6. Existing NOK records are left alone —
            // this append-only behavior avoids accidentally deleting NOKs a
            // human added outside the wizard.
            if (!empty($data['next_of_kin']) && is_array($data['next_of_kin'])) {
                $nokList = isset($data['next_of_kin'][0]) ? $data['next_of_kin'] : [$data['next_of_kin']];
                foreach ($nokList as $nokData) {
                    if (empty($nokData['full_name'])) continue;
                    $nok = new NextOfKin();
                    $nok->setFullName($nokData['full_name']);
                    if (isset($nokData['phone']))        $nok->setPhone($nokData['phone']);
                    if (isset($nokData['address']))      $nok->setAddress($nokData['address']);
                    if (isset($nokData['relationship']))$nok->setRelationship($nokData['relationship']);
                    if (!empty($nokData['is_primary'])) $nok->setIsPrimary(true);
                    $customer->addNextOfKin($nok);
                    $this->em->persist($nok);
                }
            }

            // ─── Product + limit validation ─────────────────────────
            $product = $this->productRepo->find($c['product_id']);
            if ($product === null) {
                $this->em->rollback();
                return $this->notFound('Loan product not found');
            }
            if (!$product->isActive()) {
                $this->em->rollback();
                return $this->error('Loan product is inactive', 400);
            }
            if ((float) $c['amount'] < (float) $product->getMinAmount() || (float) $c['amount'] > (float) $product->getMaxAmount()) {
                $this->em->rollback();
                return $this->validationError(['amount' => "Amount must be between {$product->getMinAmount()} and {$product->getMaxAmount()}"]);
            }
            if ($c['tenure'] < $product->getMinTenure() || $c['tenure'] > $product->getMaxTenure()) {
                $this->em->rollback();
                return $this->validationError(['tenure' => "Tenure must be between {$product->getMinTenure()} and {$product->getMaxTenure()}"]);
            }

            // In-progress-loan guard — applies regardless of how we got the customer
            $staffId = $customer->getStaffId();
            if ($staffId && $this->loanRepo->hasInProgressLoanForStaffId($staffId)) {
                $this->em->rollback();
                return $this->error('Customer already has a loan application in progress', 400);
            }

            // Top-up detection unchanged — relies on staffId + product.allowsTopUp
            $loanType = LoanType::NEW_LOAN;
            $topUpBalance = '0';
            if ($staffId && $product->allowsTopUp()) {
                $disbursed = $this->loanRepo->findDisbursedByStaffId($staffId);
                if (!empty($disbursed)) {
                    $loanType = LoanType::TOP_UP;
                    $topUpBalance = $data['top_up_balance'] ?? '0';
                }
            }

            // One running loan per customer. A brand-new (non-top-up) loan is
            // blocked when the customer already has a loan that isn't terminal
            // (rejected / closed / cancelled / written-off) — regardless of
            // which agent captured it, so two agents can't both bring in a loan
            // for the same customer. Top-ups are exempt (they top up the
            // existing running loan).
            if ($loanType !== LoanType::TOP_UP) {
                $running = $this->loanRepo->findRunningByCustomer($customer->getId());
                if (!empty($running)) {
                    $existing = $running[0];
                    $this->em->rollback();
                    return $this->error(
                        'This customer already has a running loan (' . $existing->getApplicationId()
                        . ', ' . $existing->getStatus()->value . '). A new loan cannot be created until it is'
                        . ' rejected or closed.',
                        409
                    );
                }
            }

            // Calculate loan numbers
            $calc = $this->calcService->calculate(
                $product,
                $c['amount'],
                $c['tenure'],
                $c['bank_statement_mode'] ?? null,
                $topUpBalance,
            );

            // Initial status depends on role
            $userId = $request->getAttribute('user_id');
            $userRoles = $request->getAttribute('user_roles', []);
            $isAgent = in_array('agent', $userRoles, true);
            $initialStatus = $isAgent ? LoanStatus::CAPTURED : LoanStatus::DRAFT;

            // ─── Build loan ─────────────────────────────────────────
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

            // Optional loan-level metadata
            if (!empty($c['loan_amount_words']))          $loan->setLoanAmountWords($c['loan_amount_words']);
            if (!empty($c['loan_purpose']))               $loan->setLoanPurpose($c['loan_purpose']);
            if (!empty($c['repayment_method']))           $loan->setRepaymentMethod($c['repayment_method']);
            if (!empty($c['account_statement_id']))       $loan->setAccountStatementId($c['account_statement_id']);
            if (!empty($c['account_statement_password'])) $loan->setAccountStatementPassword($c['account_statement_password']);

            if (isset($c['branch_id']) && $c['branch_id']) {
                $branch = $this->locationRepo->find($c['branch_id']);
                if ($branch) $loan->setBranch($branch);
            }

            // Set agent from user context
            $agentRepo = $this->em->getRepository(\App\Domain\Entity\User::class);
            $agentUser = $agentRepo->find($userId);
            if ($agentUser && $isAgent) {
                $loan->setAgent($agentUser);

                /*
                 * Branch auto-assignment for agent-originated loans.
                 *
                 * When an agent creates a loan without explicitly supplying
                 * branch_id (the default case — the agent-mobile capture
                 * form has no branch picker), we fall back to the agent's
                 * first assigned Location. This mirrors the business rule
                 * 'branch is same as location' — an agent can only
                 * originate loans for the location(s) they're assigned to.
                 *
                 * If the agent has NO locations assigned, we reject the
                 * submission with 400 per product decision. An unassigned
                 * agent shouldn't be originating loans at all; failing
                 * loudly here surfaces the misconfigured user to the
                 * administrator.
                 *
                 * If branch_id WAS provided explicitly (and matched an
                 * existing Location), that wins — the auto-assignment
                 * only fills the gap, never overrides an explicit value.
                 */
                if ($loan->getBranch() === null) {
                    $agentLocations = $agentUser->getLocations();
                    if ($agentLocations->isEmpty()) {
                        $this->em->rollback();
                        return $this->error(
                            'Your account has no branch/location assigned. Contact your administrator to assign at least one location before creating loans.',
                            400,
                        );
                    }
                    $loan->setBranch($agentLocations->first());
                }
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
            $this->em->commit();

            $this->audit->logCreate($userId, 'Loan', $loan->getId(), $loan->toArray(), $this->getClientIp($request), $this->getUserAgent($request));

            // Notify the field agent (in-app + push + email). Best-effort —
            // failures are swallowed inside the service and never affect the
            // loan-creation result.
            $this->notifService->notifyAgent(
                $loan->getAgent(),
                'Loan captured',
                "Loan {$loan->getApplicationId()} for {$customer->getFullName()} ({$c['amount']}) has been captured.",
                $customer->getId(),
            );

            return $this->created($loan->toArray(true), 'Loan application created successfully');
        } catch (\Throwable $e) {
            if ($this->em->getConnection()->isTransactionActive()) {
                $this->em->rollback();
            }
            throw $e;
        }
    }
}
