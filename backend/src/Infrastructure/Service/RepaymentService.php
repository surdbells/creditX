<?php

declare(strict_types=1);

namespace App\Infrastructure\Service;

use App\Domain\Entity\LedgerTransaction;
use App\Domain\Entity\Loan;
use App\Domain\Entity\LoanTrail;
use App\Domain\Entity\Payment;
use App\Domain\Entity\PaymentAllocation;
use App\Domain\Entity\RepaymentSchedule;
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

        $customerLedger = $this->clRepo->findByLoan($loan->getId());
        if ($customerLedger === null) {
            throw new DomainException('Customer ledger not found for this loan');
        }

        $bankGl = $this->glRepo->findByCode('BANK');
        if ($bankGl === null) {
            throw new DomainException('Bank GL account not found');
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

            // Post journal entries
            $callback = 'REPAY-' . $payment->getReference();
            $narration = 'REPAYMENT - ' . $loan->getCustomer()->getFullName();
            $dateParts = explode('-', date('Y-m-d'));

            // DR Bank/Cash
            $drEntry = new LedgerTransaction();
            $drEntry->setGeneralLedger($bankGl);
            $drEntry->setTransType(TransactionType::DR);
            $drEntry->setTransAmount($amount);
            $drEntry->setTransNarration($narration);
            $drEntry->setTransCallback($callback);
            $drEntry->setTransDate($dateParts[0], $dateParts[1], $dateParts[2]);
            $drEntry->setIsRepayment(true);
            $drEntry->setPostedBy($userId);
            $this->em->persist($drEntry);

            // CR Customer Ledger
            $crEntry = new LedgerTransaction();
            $crEntry->setGeneralLedger($customerLedger->getGeneralLedger());
            $crEntry->setCustomerLedger($customerLedger);
            $crEntry->setTransType(TransactionType::CR);
            $crEntry->setTransAmount($amount);
            $crEntry->setTransNarration('REPAYMENT RECEIVED');
            $crEntry->setTransCallback($callback);
            $crEntry->setTransDate($dateParts[0], $dateParts[1], $dateParts[2]);
            $crEntry->setIsRepayment(true);
            $crEntry->setPostedBy($userId);
            $this->em->persist($crEntry);

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
            $this->em->commit();

            return $payment;

        } catch (\Exception $e) {
            $this->em->rollback();
            throw new DomainException('Repayment failed: ' . $e->getMessage());
        }
    }
}
