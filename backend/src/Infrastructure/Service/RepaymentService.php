<?php

declare(strict_types=1);

namespace App\Infrastructure\Service;

use App\Domain\Entity\Loan;
use App\Domain\Entity\LoanTrail;
use App\Domain\Entity\Payment;
use App\Domain\Entity\PaymentAllocation;
use App\Domain\Entity\RepaymentSchedule;
use App\Domain\Enum\JournalEntryType;
use App\Domain\Enum\LoanStatus;
use App\Domain\Enum\PaymentChannel;
use App\Domain\Enum\PaymentStatus;
use App\Domain\Enum\RepaymentStatus;
use App\Domain\Enum\TransactionType;
use App\Domain\Exception\DomainException;
use App\Domain\Repository\CustomerLedgerRepository;
use App\Domain\Repository\GeneralLedgerRepository;
use App\Domain\Repository\LedgerTransactionRepository;
use App\Domain\Repository\RepaymentScheduleRepository;
use Doctrine\ORM\EntityManagerInterface;

final class RepaymentService
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly GeneralLedgerRepository $glRepo,
        private readonly CustomerLedgerRepository $clRepo,
        private readonly RepaymentScheduleRepository $scheduleRepo,
        private readonly SettingsCacheService $settings,
        private readonly PeriodGuardService $periodGuard,
        private readonly LedgerService $ledgerService,
        private readonly LedgerTransactionRepository $ledgerTxnRepo,
        private readonly GlMappingService $glMapping,
        private readonly ?NotificationDispatchService $notifService = null,
    ) {
    }

    /**
     * Post a repayment against a loan with smart allocation.
     */
    public function postRepayment(
        Loan $loan,
        string $amount,
        PaymentChannel $channel,
        ?string $gatewayRef = null,
        ?string $userId = null,
    ): Payment {
        if (!in_array($loan->getStatus(), [LoanStatus::ACTIVE, LoanStatus::OVERDUE], true)) {
            throw new DomainException('Loan must be Active or Overdue to accept repayment');
        }

        // Back-date guard — repayments always post at today(), so this
        // only ever fires if today itself has been closed (highly
        // unusual — you wouldn't close the current month mid-day).
        // Kept as a belt-and-braces check in case a future change
        // adds a user-supplied effective date.
        $this->periodGuard->assertDateOpen(date('Y-m-d'));

        $customerLedger = $this->clRepo->findByLoan($loan->getId());
        if ($customerLedger === null) {
            throw new DomainException('Customer ledger not found for this loan');
        }

        // GL resolution via the Default Ledgers mapping — an operator override
        // if set, otherwise the historic default code (identical to before).
        $bankGl = $this->glMapping->resolveByCode('BANK');
        if ($bankGl === null) {
            throw new DomainException('Bank GL account not found');
        }

        // Loan Receivable — the aggregate asset. Repayments reduce it.
        // See DisbursementService for the paired DR at disbursement time.
        $lrGl = $this->glMapping->resolveByCode('LR');
        if ($lrGl === null) {
            throw new DomainException('Loan Receivable GL (LR) not found. Run seeder.');
        }

        // Interest Income — recognised when interest is collected (cash
        // basis) OR cleared from Interest Receivable when it was already
        // accrued. Required: without crediting II, loan interest income
        // never reaches the GL and LR drifts negative by the interest
        // collected over the life of the loan.
        $iiGl = $this->glMapping->resolveByCode('II');
        if ($iiGl === null) {
            throw new DomainException('Interest Income GL (II) not found. Run seeder.');
        }

        // Accrual-basis support (optional). When the interest-accrual
        // engine has posted DR INTRECV / CR II for this loan, a repayment
        // clears the receivable rather than recognising income twice.
        // INTSUSP holds accrued interest on non-performing loans that was
        // NOT taken to income; collecting it releases the suspense to
        // income. Both GLs are nullable — if a tenant hasn't seeded them,
        // we fall back to pure cash-basis recognition (CR II for all
        // interest), which is still correct, just not time-apportioned.
        $intRecvGl = $this->glMapping->resolveByCode('INTRECV');
        $intSuspGl = $this->glMapping->resolveByCode('INTSUSP');

        $this->em->beginTransaction();

        try {
            $payment = new Payment();
            $payment->setLoan($loan);
            $payment->setCustomer($loan->getCustomer());
            $payment->setAmount($amount);
            $payment->setChannel($channel);
            $payment->setReference(Payment::generateReference());
            $payment->setGatewayReference($gatewayRef);
            $payment->setPaymentDate(new \DateTime());
            $payment->setStatus(PaymentStatus::SUCCESS);
            $payment->setVerifiedBy($userId);

            // Smart allocation
            $remaining = $amount;
            $allocOrder = $this->settings->getJson('penalty.payment_allocation_order', ['penalty', 'interest', 'principal']);

            $schedules = $this->scheduleRepo->findByLoan($loan->getId());
            $pendingSchedules = array_filter($schedules, fn(RepaymentSchedule $s) => in_array($s->getStatus(), [RepaymentStatus::PENDING, RepaymentStatus::PARTIAL, RepaymentStatus::OVERDUE], true));
            usort($pendingSchedules, fn(RepaymentSchedule $a, RepaymentSchedule $b) => $a->getInstallmentNumber() <=> $b->getInstallmentNumber());

            $totalPrincipal = '0.00';
            $totalInterest = '0.00';
            $totalPenalty = '0.00';

            foreach ($pendingSchedules as $schedule) {
                if (bccomp($remaining, '0.00', 2) <= 0) break;

                $outstanding = $schedule->getOutstanding();
                if (bccomp($outstanding, '0.00', 2) <= 0) continue;

                $toAllocate = bccomp($remaining, $outstanding, 2) >= 0 ? $outstanding : $remaining;
                $schedule->markPaid($toAllocate);
                $remaining = bcsub($remaining, $toAllocate, 2);

                // Split allocation between principal and interest proportionally
                $totalScheduleAmount = $schedule->getTotalAmount();
                if (bccomp($totalScheduleAmount, '0.00', 2) > 0) {
                    $interestRatio = bcdiv($schedule->getInterestAmount(), $totalScheduleAmount, 6);
                    $interestPortion = (string) ceil((float) bcmul($toAllocate, $interestRatio, 6));
                    $principalPortion = bcsub($toAllocate, $interestPortion, 2);
                } else {
                    $interestPortion = '0.00';
                    $principalPortion = $toAllocate;
                }

                $totalPrincipal = bcadd($totalPrincipal, $principalPortion, 2);
                $totalInterest = bcadd($totalInterest, $interestPortion, 2);

                // Create allocation record
                $alloc = new PaymentAllocation();
                $alloc->setSchedule($schedule);
                $alloc->setAllocatedAmount($toAllocate);
                $alloc->setAllocationType('principal_interest');
                $payment->addAllocation($alloc);
            }

            $payment->setAllocatedPrincipal($totalPrincipal);
            $payment->setAllocatedInterest($totalInterest);
            $payment->setAllocatedPenalty($totalPenalty);

            $this->em->persist($payment);

            // Post the repayment journal, splitting cash received into
            // its principal and interest components so interest income is
            // recognised in the GL.
            //
            //   DR Bank                    (cash in, full amount)
            //   CR Loan Receivable (LR)    principal portion (+ any
            //                              unallocated overpayment)
            //   CR Interest Receivable     interest already accrued for
            //     (INTRECV)                this loan — clears the asset
            //   CR Interest Income (II)    interest not yet accrued —
            //                              recognised now on a cash basis
            //
            // If the loan was non-performing, some of the cleared interest
            // was parked in Interest-in-Suspense (INTSUSP) rather than
            // income; collecting it releases the suspense to income:
            //   DR Interest in Suspense / CR Interest Income.
            //
            // CUBGL is deliberately untouched here (it nets to zero per
            // customer at disbursement; the UI reads outstanding balances
            // from repayment_schedules). The customerLedger tag is kept on
            // the LR/INTRECV/INTSUSP lines so per-customer history still
            // threads through the Journal view filtered by customer.
            $callback = 'REPAY-' . $payment->getReference();
            $narration = 'REPAYMENT - ' . $loan->getCustomer()->getFullName();

            // Overpayment beyond all pending schedules: treat as extra
            // principal paydown on LR (matches the prior behaviour of
            // crediting LR with the whole payment).
            $principalCredit = bcadd($totalPrincipal, $remaining, 2);

            // How much interest was already accrued (and is still
            // uncollected) for THIS loan? Clear that from INTRECV; the
            // remainder is recognised straight to income.
            $intRecvBalance = '0.00';
            $intSuspBalance = '0.00';
            if ($intRecvGl !== null) {
                $r = $this->ledgerTxnRepo->getGlSumForCustomerLedger($intRecvGl->getId(), $customerLedger->getId());
                $intRecvBalance = bcsub($r['total_dr'], $r['total_cr'], 2); // asset: DR − CR
            }
            if ($intSuspGl !== null) {
                $s = $this->ledgerTxnRepo->getGlSumForCustomerLedger($intSuspGl->getId(), $customerLedger->getId());
                $intSuspBalance = bcsub($s['total_cr'], $s['total_dr'], 2); // contra-asset: CR − DR
            }
            if (bccomp($intRecvBalance, '0.00', 2) < 0) $intRecvBalance = '0.00';
            if (bccomp($intSuspBalance, '0.00', 2) < 0) $intSuspBalance = '0.00';

            $interestCleared = bccomp($totalInterest, $intRecvBalance, 2) <= 0 ? $totalInterest : $intRecvBalance;
            $interestToIncome = bcsub($totalInterest, $interestCleared, 2); // not-yet-accrued → cash basis
            $suspenseRelease = bccomp($interestCleared, $intSuspBalance, 2) <= 0 ? $interestCleared : $intSuspBalance;

            $lines = [
                ['gl' => $bankGl, 'type' => TransactionType::DR,
                    'amount' => $amount, 'narration' => $narration,
                    'isRepayment' => true],
            ];
            if (bccomp($principalCredit, '0.00', 2) > 0) {
                $lines[] = ['gl' => $lrGl, 'customerLedger' => $customerLedger,
                    'type' => TransactionType::CR, 'amount' => $principalCredit,
                    'narration' => 'PRINCIPAL REPAYMENT', 'isRepayment' => true];
            }
            if ($intRecvGl !== null && bccomp($interestCleared, '0.00', 2) > 0) {
                $lines[] = ['gl' => $intRecvGl, 'customerLedger' => $customerLedger,
                    'type' => TransactionType::CR, 'amount' => $interestCleared,
                    'narration' => 'ACCRUED INTEREST COLLECTED', 'isRepayment' => true];
            }
            if (bccomp($interestToIncome, '0.00', 2) > 0) {
                $lines[] = ['gl' => $iiGl, 'type' => TransactionType::CR,
                    'amount' => $interestToIncome, 'narration' => 'INTEREST INCOME (CASH BASIS)',
                    'isRepayment' => true];
            }
            // Release suspended interest to income on collection (self-
            // balancing pair, independent of the cash side above).
            if ($intSuspGl !== null && bccomp($suspenseRelease, '0.00', 2) > 0) {
                $lines[] = ['gl' => $intSuspGl, 'customerLedger' => $customerLedger,
                    'type' => TransactionType::DR, 'amount' => $suspenseRelease,
                    'narration' => 'INTEREST IN SUSPENSE RELEASED'];
                $lines[] = ['gl' => $iiGl, 'type' => TransactionType::CR,
                    'amount' => $suspenseRelease, 'narration' => 'SUSPENDED INTEREST RECOGNISED ON COLLECTION'];
            }

            $this->ledgerService->postJournal(
                entryType: JournalEntryType::REPAYMENT,
                postingDate: date('Y-m-d'),
                narration: $narration,
                postedBy: $userId,
                lines: $lines,
                legacyCallback: $callback,
                reference: $payment->getReference(),
            );

            // Check if loan is fully repaid
            $allPaid = true;
            foreach ($schedules as $s) {
                if (!in_array($s->getStatus(), [RepaymentStatus::PAID, RepaymentStatus::WAIVED], true)) {
                    $allPaid = false;
                    break;
                }
            }

            $loanClosed = false;
            if ($allPaid) {
                $loan->transitionTo(LoanStatus::CLOSED);
                $loan->setClosedAt(new \DateTimeImmutable('now', new \DateTimeZone($_ENV['APP_TIMEZONE'] ?? 'Africa/Lagos')));
                $customerLedger->close();
                $loanClosed = true;

                $trail = new LoanTrail();
                $trail->setUserId($userId);
                $trail->setAction('Loan fully repaid and closed');
                $loan->addTrail($trail);
            } elseif ($loan->getStatus() === LoanStatus::OVERDUE) {
                // Check if overdue schedules are now resolved
                $stillOverdue = false;
                foreach ($schedules as $s) {
                    if ($s->getStatus() === RepaymentStatus::OVERDUE) { $stillOverdue = true; break; }
                }
                if (!$stillOverdue) {
                    $loan->transitionTo(LoanStatus::ACTIVE);
                    $trail = new LoanTrail();
                    $trail->setUserId($userId);
                    $trail->setAction('Loan restored to active after overdue payment');
                    $loan->addTrail($trail);
                }
            }

            // Trail
            $trail = new LoanTrail();
            $trail->setUserId($userId);
            $trail->setAction('Repayment posted');
            $trail->setDetails(['amount' => $amount, 'channel' => $channel->value, 'reference' => $payment->getReference()]);
            $loan->addTrail($trail);

            $this->em->flush();
            // Phase-2.5 D.2: postJournal() above already validated the
            // journal balance. The flush here commits non-journal writes
            // (Payment, allocations, schedule status updates, loan
            // status, trail) atomically with the journal.
            $this->em->commit();

            // Notify the field agent once the loan is fully repaid and closed
            // (in-app + push + email). Post-commit and best-effort so a
            // notification hiccup can't roll back a settled payment.
            if ($loanClosed && $this->notifService !== null) {
                try {
                    $this->notifService->notifyAgent(
                        $loan->getAgent(),
                        'Loan closed',
                        "Loan {$loan->getApplicationId()} for {$loan->getCustomer()->getFullName()} has been fully repaid and closed.",
                        $loan->getCustomer()->getId(),
                    );
                } catch (\Throwable $e) { /* best-effort */ }
            }

            return $payment;

        } catch (\Exception $e) {
            $this->em->rollback();
            throw new DomainException('Repayment failed: ' . $e->getMessage());
        }
    }
}
