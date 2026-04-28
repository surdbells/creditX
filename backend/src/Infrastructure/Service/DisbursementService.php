<?php

declare(strict_types=1);

namespace App\Infrastructure\Service;

use App\Domain\Entity\CustomerLedger;
use App\Domain\Entity\LedgerTransaction;
use App\Domain\Entity\Loan;
use App\Domain\Entity\LoanTrail;
use App\Domain\Entity\RepaymentSchedule;
use App\Domain\Enum\CustomerLedgerStatus;
use App\Domain\Enum\LoanStatus;
use App\Domain\Enum\TransactionType;
use App\Domain\Exception\DomainException;
use App\Domain\Repository\CustomerLedgerRepository;
use App\Domain\Repository\GeneralLedgerRepository;
use Doctrine\ORM\EntityManagerInterface;

final class DisbursementService
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly GeneralLedgerRepository $glRepo,
        private readonly CustomerLedgerRepository $clRepo,
        private readonly LoanCalculationService $calcService,
        private readonly SettingsCacheService $settings,
        private readonly PeriodGuardService $periodGuard,
        private readonly LedgerService $ledgerService,
    ) {
    }

    /**
     * Disburse an approved loan — full accounting workflow.
     *
     * @param Loan $loan Must be in APPROVED status
     * @param string $settlementGlId GL account for settlement (bank/cash)
     * @param string $effectiveDate Disbursement effective date (Y-m-d)
     * @param string|null $userId The user performing disbursement
     * @param string|null $topUpBalanceOverride Optional override for the
     *        top-up balance originally captured at submission. When provided
     *        (from DisbursementPreviewAction's auto-detect or a manual entry
     *        on the disburse dialog), the loan's captured top-up balance is
     *        replaced and the calculation re-run before posting. Pass null
     *        to preserve the capture-time value.
     * @throws DomainException
     */
    public function disburse(
        Loan $loan,
        string $settlementGlId,
        string $effectiveDate,
        ?string $userId = null,
        ?string $topUpBalanceOverride = null,
    ): array
    {
        if ($loan->getStatus() !== LoanStatus::APPROVED) {
            throw new DomainException('Loan must be in Approved status to disburse');
        }

        // Back-date guard — effective date must not fall in a closed
        // period. Disbursement is the only entry path where the user
        // supplies the effective date directly (other posting paths
        // default to today()), so a back-dated disbursement is the
        // most likely way a closed period gets mutated.
        $this->periodGuard->assertDateOpen($effectiveDate);

        $settlementGl = $this->glRepo->find($settlementGlId);
        if ($settlementGl === null) {
            throw new DomainException('Settlement GL account not found');
        }

        $transaction = $loan->getTransaction();
        if ($transaction === null) {
            throw new DomainException('Loan transaction record not found');
        }

        /*
         * Apply top-up balance override if provided.
         *
         * At capture time, the agent enters (or the system auto-detects)
         * the customer's outstanding balance from their prior loan. That
         * value is stored on LoanTransaction.topUpBalance and is what
         * drives net_disbursed = gross - fees - top_up.
         *
         * Between capture and disbursement (which can be days or weeks
         * depending on the approval workflow), the customer may have
         * continued paying down their prior loan. The admin disbursement
         * dialog re-detects the current outstanding balance and can pass
         * it here as an override.
         *
         * LOCK RULE: if the underwriter explicitly set a top-up balance
         * during their approval step (isTopUpLockedByUnderwriter), the
         * disbursement override is ignored. The underwriter's decision is
         * the authoritative source — the disbursement step is a
         * mechanical execution of what the underwriter approved. A client
         * that tries to override anyway gets a DomainException so the
         * mismatch surfaces rather than being silently dropped.
         *
         * When overridden (and not locked), we:
         *   1. Update LoanTransaction.topUpBalance
         *   2. Update Loan.topUpBalance (kept in sync)
         *   3. Re-run LoanCalculationService to compute fresh net_disbursed
         *   4. Update LoanTransaction.netDisbursed
         *
         * The fee breakdown is NOT recalculated — fees are a function of
         * gross loan and product config, not top-up. Only the DR/CR net
         * disbursed and B/F top-up amounts change based on the override.
         */
        if ($topUpBalanceOverride !== null) {
            if ($loan->isTopUpLockedByUnderwriter()) {
                throw new DomainException(
                    'Top-up balance was set by the underwriter and cannot be changed at disbursement. ' .
                    'Locked value: ' . $loan->getTopUpBalanceUnderwriter()
                );
            }
            $newTopUp = number_format((float) $topUpBalanceOverride, 2, '.', '');
            $calc = $this->calcService->calculate(
                $loan->getProduct(),
                $loan->getAmountRequested(),
                $loan->getTenure(),
                $loan->getBankStatementMode(),
                $newTopUp,
            );
            $transaction->setTopUpBalance($newTopUp);
            $transaction->setNetDisbursed($calc['net_disbursed']);
            $loan->setTopUpBalance(bccomp($newTopUp, '0.00', 2) > 0 ? $newTopUp : null);
        } elseif ($loan->isTopUpLockedByUnderwriter()) {
            // Operator accepted the underwriter's locked value (no
            // override) — sync the transaction's top_up + net_disbursed
            // to match, in case the application-time values are stale.
            $lockedTopUp = (string) $loan->getTopUpBalanceUnderwriter();
            if (bccomp($transaction->getTopUpBalance() ?? '0.00', $lockedTopUp, 2) !== 0) {
                $calc = $this->calcService->calculate(
                    $loan->getProduct(),
                    $loan->getAmountRequested(),
                    $loan->getTenure(),
                    $loan->getBankStatementMode(),
                    $lockedTopUp,
                );
                $transaction->setTopUpBalance($lockedTopUp);
                $transaction->setNetDisbursed($calc['net_disbursed']);
                $loan->setTopUpBalance(bccomp($lockedTopUp, '0.00', 2) > 0 ? $lockedTopUp : null);
            }
        }

        $callback = 'DISB-' . $loan->getApplicationId() . '-' . date('YmdHis');
        $customerName = $loan->getCustomer()->getFullName();

        $this->em->beginTransaction();

        try {
            // ─── 1. Create customer ledger ───
            $customerLedger = new CustomerLedger();
            $customerLedger->setCustomer($loan->getCustomer());
            $customerLedger->setLoan($loan);

            // Find or create a parent GL for customer ledgers
            $customerGl = $this->glRepo->findByCode('CUBGL');
            if ($customerGl === null) {
                throw new DomainException('Customer balance GL (CUBGL) not found. Run seeder.');
            }
            $customerLedger->setGeneralLedger($customerGl);
            $customerLedger->setAccountNumber(CustomerLedger::generateAccountNumber());
            $this->em->persist($customerLedger);

            // Loan Receivable GL — the aggregate asset account that
            // represents everything we're owed by borrowers. Required
            // for a balanced trial balance: the CR CUBGL at step 2
            // creates a credit in the GL total that needs a matching
            // DR somewhere. Before this fix, that DR was missing and
            // the trial balance was unbalanced by the sum of every
            // historical gross loan amount.
            //
            // Semantics: LR tracks the portfolio asset; CUBGL is the
            // per-customer wash account. They move together at
            // disbursement (DR LR + CR CUBGL for gross) and at
            // repayment (DR BANK + CR LR; CUBGL stays unchanged on
            // the repayment side since schedules drive outstanding-
            // balance display, not CUBGL).
            $lrGl = $this->glRepo->findByCode('LR');
            if ($lrGl === null) {
                throw new DomainException('Loan Receivable GL (LR) not found. Run seeder.');
            }

            // ─── 2. DR Loan Receivable + CR gross loan to customer ledger ───
            // Gross loan = application amount + ADDS_TO_GROSS fees.
            // This is what the customer owes the business.
            $this->postEntry(
                $lrGl, null, TransactionType::DR,
                $transaction->getGrossLoan(), 'LOAN DISBURSEMENT APPROVED - ' . $customerName,
                $callback, $effectiveDate, $userId
            );
            $this->postEntry(
                $customerGl, $customerLedger, TransactionType::CR,
                $transaction->getGrossLoan(), 'LOAN DISBURSEMENT APPROVED',
                $callback, $effectiveDate, $userId
            );

            // ─── 3. DR each fee from customer ledger + CR fee GL ───
            //
            // Both ADDS_TO_GROSS fees (admin, insurance) and
            // DEDUCTED_FROM_DISBURSEMENT fees (management, bank statement)
            // are DR'd from the customer ledger here, and CR'd to their
            // respective fee GLs as income recognition.
            //
            // Why both types post the same way:
            //
            //   Model A (Customer ledger must balance to zero at disbursement
            //   — standard loan accounting):
            //
            //     Step 2 CR'd gross_loan = app_amount + ADDS_TO_GROSS fees.
            //     To balance, every fee amount baked into gross_loan must be
            //     DR'd out. Combined with the DR of net_disbursed (which is
            //     app_amount minus DEDUCTED fees), the customer ledger nets
            //     to zero:
            //
            //       CR gross_loan (500 + 2 admin + 10 insurance = 512)
            //       DR admin fee  (2)
            //       DR insurance  (10)
            //       DR mgmt fee   (10)   — was DEDUCTED, still posts here
            //       DR net_disb   (490)  — 500 - 10 mgmt
            //       ─────────────
            //       net balance = 0
            //
            //     Fee GL accounts (admin, insurance, mgmt, etc.) each get
            //     a CR for their fee amount, recognising them as income at
            //     disbursement time. This matches standard Nigerian loan
            //     accounting: fees are front-loaded income, while interest
            //     is amortised as it accrues.
            //
            // Regression fix: a prior revision of this method filtered
            //   with `if (!\$fb->isDeducted() || ...) continue;` which
            //   skipped ADDS_TO_GROSS fees entirely, leaving them as a
            //   permanent CR on the customer ledger (never DR'd out).
            //   Customers looked like they owed the full ADDS_TO_GROSS
            //   total the moment the loan disbursed — before any
            //   repayments came due.
            //
            // Amount guard kept: fees with zero amount are still skipped
            //   to avoid no-op journal rows cluttering the ledger.
            $feeBreakdowns = $loan->getFeeBreakdowns();
            foreach ($feeBreakdowns as $fb) {
                if (bccomp($fb->getAmount(), '0.00', 2) <= 0) {
                    continue;
                }

                // DR from customer ledger (reduces gross_loan credit)
                $this->postEntry(
                    $customerGl, $customerLedger, TransactionType::DR,
                    $fb->getAmount(), strtoupper($fb->getFeeType()->getName()),
                    $callback, $effectiveDate, $userId
                );

                // CR to fee type's GL (recognises income)
                $feeGl = null;
                if ($fb->getFeeType()->getGlAccountId()) {
                    $feeGl = $this->glRepo->find($fb->getFeeType()->getGlAccountId());
                }
                if ($feeGl === null) {
                    $feeGl = $this->glRepo->findByCode($fb->getFeeType()->getCode());
                }
                if ($feeGl !== null) {
                    $this->postEntry(
                        $feeGl, null, TransactionType::CR,
                        $fb->getAmount(), $customerName . ' - ' . $fb->getFeeType()->getName(),
                        $callback, $effectiveDate, $userId
                    );
                }
            }

            // ─── 4. DR top-up balance if applicable ───
            // Top-up mechanics: when a customer takes a new loan while
            // an old one is outstanding, the old loan's remaining
            // balance (top-up) gets rolled into the new loan's gross.
            //
            // The NEW customer ledger has already been CR'd for the
            // gross (step 2). We now DR it for the top-up (reducing
            // what the new loan 'owes') and CR the OLD customer ledger
            // by the same amount — which zeroes out the old ledger's
            // outstanding position. Net effect: old loan's debt is
            // transferred into the new loan's gross, accounted for
            // via the sub-ledgers.
            //
            // ## Previous bug (pre-fix)
            //
            // The CR used to post to the parent GL with
            // customer_ledger_id=NULL. This produced an 'orphan
            // posting' — a direct hit on CUBGL that bypassed any
            // sub-ledger. The GL reconciliation report flagged
            // this as a discrepancy on every top-up disbursement.
            //
            // Now the CR is scoped to the previous loan's customer
            // ledger, so the parent CUBGL has no direct postings and
            // the sub-ledger aggregate is authoritative.
            //
            // Fallback: if we can't resolve the previous loan's
            // customer ledger (data inconsistency, or top-up entered
            // without a previous_loan_id — which shouldn't happen but
            // did in some legacy data), skip the CR entirely. Better
            // to under-account than to leak an orphan. Operators will
            // see the extra balance on the new customer ledger and
            // can investigate.
            $topUpBalance = $transaction->getTopUpBalance();
            if (bccomp($topUpBalance, '0.00', 2) > 0) {
                $this->postEntry(
                    $customerGl, $customerLedger, TransactionType::DR,
                    $topUpBalance, 'PREVIOUS BALANCE B/F',
                    $callback, $effectiveDate, $userId
                );

                // Resolve the previous loan's ledger so we can close
                // out its balance via the sub-ledger.
                $previousLedger = null;
                if ($loan->getPreviousLoanId()) {
                    $previousLedger = $this->clRepo->findByLoan($loan->getPreviousLoanId());
                }

                if ($previousLedger !== null) {
                    $this->postEntry(
                        $customerGl, $previousLedger, TransactionType::CR,
                        $topUpBalance, 'PREVIOUS LOAN CLOSED VIA TOP-UP - ' . $customerName,
                        $callback, $effectiveDate, $userId
                    );
                } else {
                    // No previous ledger resolvable — log for
                    // operator attention. This path used to post an
                    // orphan to the parent GL; now we skip the CR
                    // and the operator sees the imbalance on the
                    // NEW customer ledger (a DR with no matching CR)
                    // rather than on the parent account.
                    error_log(sprintf(
                        'DisbursementService: top-up CR skipped — no previous ledger for loan %s (previous_loan_id=%s)',
                        $loan->getId(),
                        $loan->getPreviousLoanId() ?? 'NULL',
                    ));
                }
            }

            // ─── 5. DR net disbursed from customer ledger ───
            $this->postEntry(
                $customerGl, $customerLedger, TransactionType::DR,
                $transaction->getNetDisbursed(), 'NET DISBURSED',
                $callback, $effectiveDate, $userId
            );

            // ─── 6. CR settlement GL ───
            $this->postEntry(
                $settlementGl, null, TransactionType::CR,
                $transaction->getNetDisbursed(), 'LOAN SETTLEMENT - ' . $customerName,
                $callback, $effectiveDate, $userId
            );

            // ─── 7. Update loan status ───
            $loan->transitionTo(LoanStatus::DISBURSED);
            $loan->setDisbursedAt(new \DateTimeImmutable($effectiveDate, new \DateTimeZone($_ENV['APP_TIMEZONE'] ?? 'Africa/Lagos')));

            // Then transition to active
            $loan->transitionTo(LoanStatus::ACTIVE);

            // ─── 7b. Auto-close previous loan on top-up (Gap 14) ───
            if (bccomp($topUpBalance, '0.00', 2) > 0 && $loan->getPreviousLoanId()) {
                $previousLoan = $this->em->find(Loan::class, $loan->getPreviousLoanId());
                if ($previousLoan !== null && in_array($previousLoan->getStatus(), [LoanStatus::ACTIVE, LoanStatus::OVERDUE, LoanStatus::DISBURSED], true)) {
                    $previousLoan->transitionTo(LoanStatus::CLOSED);
                    $previousLoan->setClosedAt(new \DateTimeImmutable($effectiveDate, new \DateTimeZone($_ENV['APP_TIMEZONE'] ?? 'Africa/Lagos')));

                    // Close previous customer ledger
                    $prevLedger = $this->clRepo->findByLoan($previousLoan->getId());
                    if ($prevLedger !== null) {
                        $prevLedger->close();
                    }

                    // Waive remaining schedules on previous loan
                    $prevSchedules = $this->em->getRepository(RepaymentSchedule::class)->findBy(['loan' => $previousLoan->getId()]);
                    foreach ($prevSchedules as $ps) {
                        if (in_array($ps->getStatus()->value, ['pending', 'partial', 'overdue'], true)) {
                            $ps->setStatus(\App\Domain\Enum\RepaymentStatus::WAIVED);
                        }
                    }

                    $prevTrail = new LoanTrail();
                    $prevTrail->setUserId($userId);
                    $prevTrail->setAction('Loan closed via top-up — new loan ' . $loan->getApplicationId());
                    $previousLoan->addTrail($prevTrail);
                }
            }

            // ─── 8. Generate repayment schedule ───
            $this->generateRepaymentSchedule($loan, $customerLedger, $effectiveDate);

            // ─── 9. Trail ───
            $trail = new LoanTrail();
            $trail->setUserId($userId);
            $trail->setAction('Loan disbursed');
            $trail->setDetails([
                'settlement_gl' => $settlementGl->getAccountCode(),
                'effective_date' => $effectiveDate,
                'net_disbursed' => $transaction->getNetDisbursed(),
                'customer_ledger' => $customerLedger->getAccountNumber(),
                'callback' => $callback,
            ]);
            $loan->addTrail($trail);

            $this->em->flush();
            // Phase-1 invariant: every posting transaction must leave
            // its batch balanced (debits == credits across the whole
            // callback group). Throws if the carefully-orchestrated
            // postEntry() pairs above have a bug; the catch below
            // handles rollback. See LedgerService::validateBatchBalance.
            $this->ledgerService->validateBatchBalance($callback);
            $this->em->commit();

            return [
                'loan_id' => $loan->getId(),
                'application_id' => $loan->getApplicationId(),
                'status' => $loan->getStatus()->value,
                'customer_ledger' => $customerLedger->getAccountNumber(),
                'net_disbursed' => $transaction->getNetDisbursed(),
                'callback' => $callback,
                'effective_date' => $effectiveDate,
            ];

        } catch (\Exception $e) {
            $this->em->rollback();
            throw new DomainException('Disbursement failed: ' . $e->getMessage());
        }
    }

    /**
     * Post a single ledger entry.
     */
    private function postEntry(
        \App\Domain\Entity\GeneralLedger $gl,
        ?CustomerLedger $customerLedger,
        TransactionType $type,
        string $amount,
        string $narration,
        string $callback,
        string $effectiveDate,
        ?string $userId,
    ): void {
        if (bccomp($amount, '0.00', 2) <= 0) {
            return;
        }

        $dateParts = explode('-', $effectiveDate);
        $entry = new LedgerTransaction();
        $entry->setGeneralLedger($gl);
        $entry->setCustomerLedger($customerLedger);
        $entry->setTransType($type);
        $entry->setTransAmount($amount);
        $entry->setTransNarration($narration);
        $entry->setTransCallback($callback);
        $entry->setTransDate($dateParts[0] ?? date('Y'), $dateParts[1] ?? date('m'), $dateParts[2] ?? date('d'));
        $entry->setPostedBy($userId);

        $this->em->persist($entry);
    }

    /**
     * Generate monthly repayment schedule entries.
     */
    private function generateRepaymentSchedule(Loan $loan, CustomerLedger $ledger, string $effectiveDate): void
    {
        $transaction = $loan->getTransaction();
        if ($transaction === null) {
            return;
        }

        $tenure = $transaction->getLoanTenure();
        $calc = $this->calcService->calculate(
            $loan->getProduct(),
            $transaction->getAppAmount(),
            $tenure,
            $loan->getBankStatementMode(),
            $transaction->getTopUpBalance(),
        );

        $schedulePreview = $calc['schedule_preview'] ?? [];

        $baseDate = new \DateTime($effectiveDate);

        for ($i = 0; $i < $tenure; $i++) {
            $dueDate = (clone $baseDate)->modify('+' . ($i + 1) . ' months');

            $schedule = new RepaymentSchedule();
            $schedule->setLoan($loan);
            $schedule->setLedger($ledger);
            $schedule->setInstallmentNumber($i + 1);
            $schedule->setDueDate($dueDate);

            if (isset($schedulePreview[$i])) {
                $schedule->setPrincipalAmount($schedulePreview[$i]['principal']);
                $schedule->setInterestAmount($schedulePreview[$i]['interest']);
                $schedule->setTotalAmount($schedulePreview[$i]['total']);
            } else {
                // Fallback to flat split
                $schedule->setPrincipalAmount($calc['mr_principal']);
                $schedule->setInterestAmount($calc['mr_interest']);
                $schedule->setTotalAmount($calc['mr_principal_interest']);
            }

            $this->em->persist($schedule);
        }
    }
}
