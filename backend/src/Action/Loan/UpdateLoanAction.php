<?php
declare(strict_types=1);
namespace App\Action\Loan;

use App\Domain\Entity\{LoanTrail, NextOfKin};
use App\Domain\Enum\LoanStatus;
use App\Domain\Repository\{CustomerRepository, LoanProductRepository, LoanRepository};
use App\Infrastructure\Service\{ApiResponse, AuditService, LoanCalculationService};
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * PUT /api/loans/{id} — update a loan application.
 *
 * This action supports the same nested payload shape as CreateLoanAction
 * so the agent's edit-loan wizard (which reuses loan-capture.page.ts)
 * can submit edits using the exact same form-serialization code it uses
 * for creation.
 *
 * Accepted payload (all fields optional — partial update semantics):
 *
 *   {
 *     product_id: string,
 *     amount: string (decimal),
 *     tenure: int,
 *     bank_statement_mode: string,
 *     loan_amount_words: string,
 *     loan_purpose: string,
 *     repayment_method: string,
 *     account_statement_id: string,
 *     account_statement_password: string,
 *
 *     customer: {
 *       full_name, phone, email, home_address, permanent_address,
 *       state_of_origin, lga, bvn, bank_name, account_number,
 *       job_title, employer, organization, gross_pay, ... (36+ fields)
 *     },
 *
 *     next_of_kin: [
 *       { full_name, phone, relationship, home_address, ... }
 *     ]
 *   }
 *
 * ## Status guard
 *
 * Per product decision this session, edits are allowed while the loan
 * is in CAPTURED, DRAFT, or SUBMITTED state. Once the approval workflow
 * starts (UNDER_REVIEW) or later, the loan is frozen — approvers are
 * making decisions based on the data in the form and shouldn't see it
 * change underneath them.
 *
 * The user will get a 400 with a clear message explaining which status
 * the loan is currently in so they understand why editing is refused.
 *
 * ## What we DON'T touch
 *
 * - customer_id: even if provided, ignored. Editing a loan never
 *   re-assigns it to a different customer. The agent's edit UI skips
 *   Step 2 (customer lookup) entirely per session decision.
 *
 * - agent: preserved from the original creation. Editing a loan
 *   doesn't change who originated it.
 *
 * - branch: preserved from the original creation. Branch auto-assignment
 *   is a create-time concern (commit b649fb6).
 *
 * - application_id: immutable by design.
 *
 * - Fee breakdown, transaction, gross_loan, net_disbursed: these are
 *   computed from product + amount + tenure. If the user edits amount/
 *   tenure, we recompute fees + transaction via LoanCalculationService
 *   so downstream approval sees correct numbers.
 *
 * ## Recomputation
 *
 * When amount OR tenure OR product changes, we recalculate the full
 * LoanTransaction (gross_loan, net_disbursed, fee breakdowns). The
 * loan's existing fee_breakdowns rows are replaced with fresh ones.
 * LoanCalculationService.calculate() returns the same structure used
 * in CreateLoanAction so code paths stay parallel.
 *
 * ## Trail + audit
 *
 * - Writes a LoanTrail 'Loan updated by agent' entry so the loan
 *   history reflects the edit.
 * - AuditService.logUpdate captures the full old/new diff for
 *   compliance.
 */
final class UpdateLoanAction
{
    use ApiResponse;

    public function __construct(
        private readonly LoanRepository $repo,
        private readonly CustomerRepository $customerRepo,
        private readonly LoanProductRepository $productRepo,
        private readonly LoanCalculationService $calcService,
        private readonly AuditService $audit,
        private readonly EntityManagerInterface $em,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $loan = $this->repo->find($args['id'] ?? '');
        if ($loan === null) return $this->notFound('Loan not found');

        // Field agents may only touch their own jobs.
        $callerId = $request->getAttribute('user_id');
        $caller = $callerId ? $this->em->find(\App\Domain\Entity\User::class, $callerId) : null;
        if ($caller instanceof \App\Domain\Entity\User && $caller->isAgent()
            && $loan->getAgent()?->getId() !== $callerId) {
            return $this->notFound('Loan not found');
        }

        // Status guard — edit only allowed in the three pre-review states.
        $editableStatuses = [LoanStatus::DRAFT, LoanStatus::CAPTURED, LoanStatus::SUBMITTED];
        if (!in_array($loan->getStatus(), $editableStatuses, true)) {
            return $this->error(
                'Loan cannot be edited in its current status (' . $loan->getStatus()->value . '). '
                . 'Edits are only allowed before the loan enters the approval workflow.',
                400,
            );
        }

        $old = $loan->toArray(true);
        $data = (array) ($request->getParsedBody() ?? []);

        $this->em->beginTransaction();
        try {
            // ─── Loan-level scalars ──────────────────────────────────
            $amountChanged = false;
            $tenureChanged = false;
            $productChanged = false;

            if (isset($data['product_id']) && $data['product_id'] !== $loan->getProduct()->getId()) {
                $product = $this->productRepo->find($data['product_id']);
                if ($product === null) {
                    $this->em->rollback();
                    return $this->validationError(['product_id' => 'Invalid product']);
                }
                $loan->setProduct($product);
                $productChanged = true;
            }

            if (isset($data['amount']) && (string) $data['amount'] !== (string) $loan->getAmountRequested()) {
                $loan->setAmountRequested((string) $data['amount']);
                $amountChanged = true;
            }

            if (isset($data['tenure']) && (int) $data['tenure'] !== $loan->getTenure()) {
                $loan->setTenure((int) $data['tenure']);
                $tenureChanged = true;
            }

            // Pass-through loan-level metadata — only set if explicitly
            // present in the payload (empty string is a clear value,
            // distinct from 'not sent').
            if (array_key_exists('bank_statement_mode', $data)) {
                $loan->setBankStatementMode((string) $data['bank_statement_mode']);
            }
            if (array_key_exists('loan_amount_words', $data)) {
                $loan->setLoanAmountWords((string) $data['loan_amount_words']);
            }
            if (array_key_exists('loan_purpose', $data)) {
                $loan->setLoanPurpose((string) $data['loan_purpose']);
            }
            if (array_key_exists('repayment_method', $data)) {
                $loan->setRepaymentMethod((string) $data['repayment_method']);
            }
            if (array_key_exists('account_statement_id', $data)) {
                $loan->setAccountStatementId((string) $data['account_statement_id']);
            }
            if (array_key_exists('account_statement_password', $data)) {
                $loan->setAccountStatementPassword((string) $data['account_statement_password']);
            }

            // ─── Customer patch (optional nested block) ──────────────
            if (isset($data['customer']) && is_array($data['customer'])) {
                $loan->getCustomer()->fillFromArray($data['customer']);
            }

            // ─── Next-of-kin replacement ──────────────────────────────
            //
            // NOK is a collection on the Customer. The agent wizard
            // captures ONE NOK (the wizard's single-NOK form) and
            // submits it as a one-element array. To avoid silently
            // dropping additional NOKs an admin may have added (e.g.
            // via a future multi-NOK UI), our rule is:
            //
            //   - If next_of_kin is present in the payload AND non-empty:
            //     replace ALL existing NOKs with the array contents.
            //   - If next_of_kin is present but empty: do nothing
            //     (interpreted as 'no changes' — never wipe by accident).
            //   - If next_of_kin is absent: do nothing.
            //
            // orphanRemoval on the Customer→NOK relation will clean up
            // removed NOK rows when we flush.
            if (isset($data['next_of_kin']) && is_array($data['next_of_kin']) && count($data['next_of_kin']) > 0) {
                $customer = $loan->getCustomer();
                // Clear existing
                foreach ($customer->getNextOfKins()->toArray() as $existing) {
                    $customer->removeNextOfKin($existing);
                }
                // Add new. NextOfKin entity has a single 'address' field
                // (not separate home/permanent). Wizard sends a string
                // for address if provided.
                foreach ($data['next_of_kin'] as $nokData) {
                    if (!is_array($nokData) || empty($nokData['full_name'])) continue;
                    $nok = new NextOfKin();
                    $nok->setFullName((string) $nokData['full_name']);
                    if (!empty($nokData['phone'])) $nok->setPhone((string) $nokData['phone']);
                    if (!empty($nokData['relationship'])) $nok->setRelationship((string) $nokData['relationship']);
                    if (!empty($nokData['address'])) $nok->setAddress((string) $nokData['address']);
                    $customer->addNextOfKin($nok);
                }
            }

            // ─── Recompute loan math if amount / tenure / product changed
            if ($amountChanged || $tenureChanged || $productChanged) {
                $calc = $this->calcService->calculate(
                    $loan->getProduct(),
                    (string) $loan->getAmountRequested(),
                    $loan->getTenure(),
                    $loan->getBankStatementMode(),
                );
                $loan->setGrossLoan((string) $calc['gross_loan']);
                $loan->setNetDisbursed((string) $calc['net_disbursed']);
                $loan->setInterestRate((string) $loan->getProduct()->getInterestRate());

                // Replace the fee breakdown rows. The Loan entity has no
                // removeFeeBreakdown() — work with the collection directly.
                // orphanRemoval is NOT set on feeBreakdowns so we also call
                // em->remove() to delete the old rows explicitly.
                foreach ($loan->getFeeBreakdowns()->toArray() as $oldFee) {
                    $loan->getFeeBreakdowns()->removeElement($oldFee);
                    $this->em->remove($oldFee);
                }
                // Build fresh rows from calc['fee_details'] — same key the
                // CreateLoanAction reads, same field mapping so behavior
                // matches create exactly.
                foreach ($calc['fee_details'] ?? [] as $fd) {
                    $feeType = $this->em->getRepository(\App\Domain\Entity\FeeType::class)->find($fd['fee_type_id']);
                    if (!$feeType) continue;
                    $newFee = new \App\Domain\Entity\LoanFeeBreakdown();
                    $newFee->setFeeType($feeType);
                    $newFee->setAmount((string) $fd['amount']);
                    $newFee->setCalculationType(\App\Domain\Enum\FeeCalculationType::from($fd['calculation_type']));
                    $newFee->setBaseValue((string) ($fd['base_value'] ?? '0'));
                    $newFee->setIsDeducted((bool) ($fd['is_deducted'] ?? false));
                    $loan->addFeeBreakdown($newFee);
                }

                // Update the LoanTransaction with fresh numbers. The
                // relation is OneToOne (loan.transaction), nullable. If
                // somehow a loan has no transaction row (data anomaly),
                // we skip silently rather than crash — the next
                // disbursement action would surface the issue.
                // Method is setNetDisbursed (not setNetDisbursement).
                $tx = $loan->getTransaction();
                if ($tx) {
                    $tx->setAppAmount((string) $loan->getAmountRequested());
                    $tx->setGrossLoan((string) $calc['gross_loan']);
                    $tx->setNetDisbursed((string) $calc['net_disbursed']);
                }
            }

            // ─── Trail + audit ────────────────────────────────────────
            $userId = $request->getAttribute('user_id');
            $trail = new LoanTrail();
            $trail->setUserId($userId);
            $trail->setAction('Loan updated');
            $trail->setIpAddress($this->getClientIp($request));
            $detailsParts = [];
            if ($productChanged) $detailsParts[] = 'product';
            if ($amountChanged) $detailsParts[] = 'amount';
            if ($tenureChanged) $detailsParts[] = 'tenure';
            if (isset($data['customer'])) $detailsParts[] = 'customer';
            if (isset($data['next_of_kin'])) $detailsParts[] = 'next_of_kin';
            if (!empty($detailsParts)) {
                $trail->setDetails(['changed' => $detailsParts]);
            }
            $loan->addTrail($trail);

            $this->em->flush();
            $this->em->commit();

            $this->audit->logUpdate(
                $userId,
                'Loan',
                $loan->getId(),
                $old,
                $loan->toArray(true),
                $this->getClientIp($request),
                $this->getUserAgent($request),
            );

            return $this->success($loan->toArray(true), 'Loan updated successfully');
        } catch (\Throwable $e) {
            $this->em->rollback();
            return $this->error('Failed to update loan: ' . $e->getMessage(), 500);
        }
    }
}
