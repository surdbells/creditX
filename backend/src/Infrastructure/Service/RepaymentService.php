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

        $bankGl = $this->glRepo->findByCode('BANK');
        if ($bankGl === null) {
            throw new DomainException('Bank GL account not found');
        }

        // Loan Receivable — the aggregate asset. Repayments reduce it.
        // See DisbursementService for the paired DR at disbursement time.
        $lrGl = $this->glRepo->findByCode('LR');
        if ($lrGl === null) {
            throw new DomainException('Loan Receivable GL (LR) not found. Run seeder.');
        }

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

            // Phase-2.5 D.2: post the repayment journal via the helper.
            // Two lines: DR Bank (cash in) and CR Loan Receivable
            // (asset reduction).
            //
            // We deliberately do NOT also touch CUBGL here. CUBGL
            // nets to zero per-customer at disbursement (see
            // DisbursementService steps 2-5); touching it here would
            // make it go negative. The UI reads outstanding balances
            // from repayment_schedules (see loan detail page), not
            // from CUBGL, so the per-customer ledger view stays
            // coherent without a repayment-side CUBGL posting.
            //
            // The customerLedger field on the CR line is preserved so
            // per-customer repayment history still threads through
            // the Journal view filtered by customer, even though the
            // GL account is now LR rather than CUBGL.
            $callback = 'REPAY-' . $payment->getReference();
            $narration = 'REPAYMENT - ' . $loan->getCustomer()->getFullName();

            $this->ledgerService->postJournal(
                entryType: JournalEntryType::REPAYMENT,
                postingDate: date('Y-m-d'),
                narration: $narration,
                postedBy: $userId,
                lines: [
                    ['gl' => $bankGl, 'type' => TransactionType::DR,
                        'amount' => $amount, 'narration' => $narration,
                        'isRepayment' => true],
                    ['gl' => $lrGl, 'customerLedger' => $customerLedger,
                        'type' => TransactionType::CR,
                        'amount' => $amount, 'narration' => 'REPAYMENT RECEIVED',
                        'isRepayment' => true],
                ],
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

            if ($allPaid) {
                $loan->transitionTo(LoanStatus::CLOSED);
                $loan->setClosedAt(new \DateTimeImmutable('now', new \DateTimeZone($_ENV['APP_TIMEZONE'] ?? 'Africa/Lagos')));
                $customerLedger->close();

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

            return $payment;

        } catch (\Exception $e) {
            $this->em->rollback();
            throw new DomainException('Repayment failed: ' . $e->getMessage());
        }
    }
}
