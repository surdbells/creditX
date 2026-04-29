<?php

declare(strict_types=1);

namespace App\Infrastructure\Service;

use App\Domain\Entity\CustomerLedger;
use App\Domain\Entity\Loan;
use App\Domain\Entity\LoanTrail;
use App\Domain\Entity\RepaymentSchedule;
use App\Domain\Enum\CustomerLedgerStatus;
use App\Domain\Enum\JournalEntryType;
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

            // ─── 2-6. Assemble all journal lines ───
            //
            // Phase-2.5 D.1 refactor: previously each step called
            // $this->postEntry() which built a LedgerTransaction inline.
            // Now we collect every line into an array and submit once
            // via LedgerService::postJournal(), which creates a
            // JournalEntry header, persists all lines linked to it,
            // flushes, and validates the batch balance.
            //
            // Why collect-then-submit instead of incremental persist:
            // postJournal needs to see the complete line set up front
            // for its pre-flight balance check (faster than flush +
            // ROLLBACK on imbalance). It also creates the header in
            // the same call, so all lines share one journal_entry_id.
            $lines = [];

            // Step 2: DR LR + CR CUBGL for gross loan
            $lines[] = ['gl' => $lrGl, 'type' => TransactionType::DR,
                'amount' => $transaction->getGrossLoan(),
                'narration' => 'LOAN DISBURSEMENT APPROVED - ' . $customerName];
            $lines[] = ['gl' => $customerGl, 'customerLedger' => $customerLedger,
                'type' => TransactionType::CR,
                'amount' => $transaction->getGrossLoan(),
                'narration' => 'LOAN DISBURSEMENT APPROVED'];

            // Step 3: per-fee DR customer ledger + CR fee GL
            //
            // Both ADDS_TO_GROSS fees (admin, insurance) and
            // DEDUCTED_FROM_DISBURSEMENT fees (management, bank statement)
            // post the same way. See the long-form comment below the
            // amount-zero guard for the full balance-math justification.
            //
            // Amount guard: skip zero-amount fees to avoid no-op rows.
            $feeBreakdowns = $loan->getFeeBreakdowns();
            foreach ($feeBreakdowns as $fb) {
                if (bccomp($fb->getAmount(), '0.00', 2) <= 0) {
                    continue;
                }

                // DR from customer ledger (reduces gross_loan credit)
                $lines[] = ['gl' => $customerGl, 'customerLedger' => $customerLedger,
                    'type' => TransactionType::DR,
                    'amount' => $fb->getAmount(),
                    'narration' => strtoupper($fb->getFeeType()->getName())];

                // CR to fee type's GL (recognises income)
                $feeGl = null;
                if ($fb->getFeeType()->getGlAccountId()) {
                    $feeGl = $this->glRepo->find($fb->getFeeType()->getGlAccountId());
                }
                if ($feeGl === null) {
                    $feeGl = $this->glRepo->findByCode($fb->getFeeType()->getCode());
                }
                if ($feeGl !== null) {
                    $lines[] = ['gl' => $feeGl, 'type' => TransactionType::CR,
                        'amount' => $fb->getAmount(),
                        'narration' => $customerName . ' - ' . $fb->getFeeType()->getName()];
                }
            }

            // Step 4: top-up balance handling. See full comment below
            // for the orphan-posting bug history.
            $topUpBalance = $transaction->getTopUpBalance();
            if (bccomp($topUpBalance, '0.00', 2) > 0) {
                $lines[] = ['gl' => $customerGl, 'customerLedger' => $customerLedger,
                    'type' => TransactionType::DR,
                    'amount' => $topUpBalance,
                    'narration' => 'PREVIOUS BALANCE B/F'];

                $previousLedger = null;
                if ($loan->getPreviousLoanId()) {
                    $previousLedger = $this->clRepo->findByLoan($loan->getPreviousLoanId());
                }

                if ($previousLedger !== null) {
                    $lines[] = ['gl' => $customerGl, 'customerLedger' => $previousLedger,
                        'type' => TransactionType::CR,
                        'amount' => $topUpBalance,
                        'narration' => 'PREVIOUS LOAN CLOSED VIA TOP-UP - ' . $customerName];
                } else {
                    // No previous ledger resolvable — log for
                    // operator attention. Posting nothing here means
                    // postJournal's balance pre-check will refuse the
                    // batch (lines won't sum to zero), and the operator
                    // sees a clear error rather than a silent orphan.
                    //
                    // Note: this is more aggressive than the pre-2.5
                    // behaviour (which silently produced an unbalanced
                    // batch). It's the right behaviour: if we can't
                    // close the previous loan, we shouldn't proceed
                    // with the new disbursement.
                    error_log(sprintf(
                        'DisbursementService: top-up CR skipped — no previous ledger for loan %s (previous_loan_id=%s)',
                        $loan->getId(),
                        $loan->getPreviousLoanId() ?? 'NULL',
                    ));
                }
            }

            // Step 5+6: DR customer ledger for net + CR settlement
            $lines[] = ['gl' => $customerGl, 'customerLedger' => $customerLedger,
                'type' => TransactionType::DR,
                'amount' => $transaction->getNetDisbursed(),
                'narration' => 'NET DISBURSED'];
            $lines[] = ['gl' => $settlementGl, 'type' => TransactionType::CR,
                'amount' => $transaction->getNetDisbursed(),
                'narration' => 'LOAN SETTLEMENT - ' . $customerName];

            // Filter zero-amount lines (preserves the prior postEntry
            // guard that silently skipped them). postJournal would
            // reject them with a validation error otherwise.
            $lines = array_values(array_filter(
                $lines,
                fn(array $l) => bccomp((string) $l['amount'], '0.00', 2) > 0
            ));

            // Submit the journal — postJournal builds the header,
            // persists all lines linked to it, flushes, and validates
            // batch balance. Throws DomainException if anything's
            // wrong (unbalanced, malformed line, etc.).
            $this->ledgerService->postJournal(
                entryType: JournalEntryType::DISBURSEMENT,
                postingDate: $effectiveDate,
                narration: 'Loan disbursement — ' . $loan->getApplicationId() . ' (' . $customerName . ')',
                postedBy: $userId,
                lines: $lines,
                legacyCallback: $callback,
                reference: $loan->getApplicationId(),
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
            // Phase-2.5 D.1: postJournal() above already validated the
            // batch balance via validateBatchBalanceByHeader. The flush
            // here commits any non-journal writes (loan status update,
            // trail, repayment schedule rows) atomically with the
            // journal that postJournal already flushed.
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
