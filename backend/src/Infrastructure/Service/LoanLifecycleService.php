<?php

declare(strict_types=1);

namespace App\Infrastructure\Service;

use App\Domain\Entity\Loan;
use App\Domain\Entity\LoanTrail;
use App\Domain\Entity\RepaymentSchedule;
use App\Domain\Enum\JournalEntryType;
use App\Domain\Enum\LoanStatus;
use App\Domain\Enum\RepaymentStatus;
use App\Domain\Enum\TransactionType;
use App\Domain\Exception\DomainException;
use App\Domain\Repository\CustomerLedgerRepository;
use App\Domain\Repository\GeneralLedgerRepository;
use App\Domain\Repository\RepaymentScheduleRepository;
use Doctrine\ORM\EntityManagerInterface;

final class LoanLifecycleService
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly GeneralLedgerRepository $glRepo,
        private readonly CustomerLedgerRepository $clRepo,
        private readonly RepaymentScheduleRepository $scheduleRepo,
        private readonly LoanCalculationService $calcService,
        private readonly PeriodGuardService $periodGuard,
        private readonly LedgerService $ledgerService,
        private readonly ?NotificationDispatchService $notifService = null,
    ) {
    }

    /**
     * Write off a non-performing loan.
     */
    public function writeOff(Loan $loan, ?string $reason, ?string $userId): array
    {
        if (!in_array($loan->getStatus(), [LoanStatus::OVERDUE, LoanStatus::ACTIVE], true)) {
            throw new DomainException('Only Active or Overdue loans can be written off');
        }

        // Back-date guard — write-off posts at today's date.
        $this->periodGuard->assertDateOpen(date('Y-m-d'));

        $customerLedger = $this->clRepo->findByLoan($loan->getId());
        $badDebtGl = $this->glRepo->findByCode('BDE');
        $lrGl = $this->glRepo->findByCode('LR');
        if ($customerLedger === null || $badDebtGl === null || $lrGl === null) {
            throw new DomainException('Required GL accounts not found (CUBGL, BDE, and LR must all be seeded)');
        }

        // Calculate outstanding balance
        $schedules = $this->scheduleRepo->findByLoan($loan->getId());
        $outstanding = '0.00';
        foreach ($schedules as $s) {
            $outstanding = bcadd($outstanding, $s->getOutstanding(), 2);
        }

        $this->em->beginTransaction();
        try {
            $callback = 'WO-' . $loan->getApplicationId() . '-' . date('YmdHis');

            // Guard: a zero-outstanding loan can't be written off as a
            // journal — there's nothing to move to bad-debt expense.
            // The original implementation would have failed here
            // anyway (Phase-1's trans_amount > 0 CHECK would reject
            // both lines), but better to surface the cause cleanly.
            if (bccomp($outstanding, '0.00', 2) <= 0) {
                throw new DomainException(
                    'Cannot write off a loan with zero outstanding balance. '
                    . 'The loan is already settled; close it via the normal '
                    . 'flow instead.'
                );
            }

            // Phase-2.5 D.3: post the write-off journal via the helper.
            // DR Bad Debt Expense + CR Loan Receivable. The customerLedger
            // link on the CR is preserved so the per-customer view still
            // shows the write-off entry in context.
            $this->ledgerService->postJournal(
                entryType: JournalEntryType::WRITE_OFF,
                postingDate: date('Y-m-d'),
                narration: 'Loan write-off — ' . $loan->getApplicationId() . ' (' . $loan->getCustomer()->getFullName() . ')',
                postedBy: $userId,
                lines: [
                    ['gl' => $badDebtGl, 'type' => TransactionType::DR,
                        'amount' => $outstanding,
                        'narration' => 'WRITE-OFF - ' . $loan->getCustomer()->getFullName()],
                    ['gl' => $lrGl, 'customerLedger' => $customerLedger,
                        'type' => TransactionType::CR,
                        'amount' => $outstanding,
                        'narration' => 'WRITE-OFF POSTED'],
                ],
                legacyCallback: $callback,
                reference: $loan->getApplicationId(),
            );

            // Waive remaining schedules
            foreach ($schedules as $s) {
                if (in_array($s->getStatus(), [RepaymentStatus::PENDING, RepaymentStatus::PARTIAL, RepaymentStatus::OVERDUE], true)) {
                    $s->setStatus(RepaymentStatus::WAIVED);
                }
            }

            $loan->transitionTo(LoanStatus::WRITTEN_OFF);
            $loan->setClosedAt(new \DateTimeImmutable('now', new \DateTimeZone($_ENV['APP_TIMEZONE'] ?? 'Africa/Lagos')));
            $customerLedger->close();

            $trail = new LoanTrail();
            $trail->setUserId($userId);
            $trail->setAction('Loan written off');
            $trail->setDetails(['outstanding' => $outstanding, 'reason' => $reason]);
            $loan->addTrail($trail);

            $this->em->flush();
            // Phase-2.5 D.3: postJournal validated the batch internally.
            // The flush here commits non-journal writes (loan status,
            // schedule waivers, trail).
            $this->em->commit();

            if ($this->notifService !== null) {
                try {
                    $this->notifService->notifyAgent(
                        $loan->getAgent(),
                        'Loan written off',
                        "Loan {$loan->getApplicationId()} for {$loan->getCustomer()->getFullName()} has been written off (outstanding {$outstanding}).",
                        $loan->getCustomer()->getId(),
                    );
                } catch (\Throwable $e) { /* best-effort */ }
            }

            return ['loan_id' => $loan->getId(), 'status' => 'written_off', 'outstanding_written_off' => $outstanding];
        } catch (\Exception $e) {
            $this->em->rollback();
            throw new DomainException('Write-off failed: ' . $e->getMessage());
        }
    }

    /**
     * Restructure a loan — recalculate terms from current outstanding.
     */
    public function restructure(Loan $loan, int $newTenure, ?string $newRate, ?string $userId): array
    {
        if (!in_array($loan->getStatus(), [LoanStatus::ACTIVE, LoanStatus::OVERDUE], true)) {
            throw new DomainException('Only Active or Overdue loans can be restructured');
        }

        $customerLedger = $this->clRepo->findByLoan($loan->getId());
        if ($customerLedger === null) {
            throw new DomainException('Customer ledger not found');
        }

        // Calculate current outstanding
        $schedules = $this->scheduleRepo->findByLoan($loan->getId());
        $outstanding = '0.00';
        foreach ($schedules as $s) {
            $outstanding = bcadd($outstanding, $s->getOutstanding(), 2);
        }

        $this->em->beginTransaction();
        try {
            // Waive old remaining schedules
            foreach ($schedules as $s) {
                if (in_array($s->getStatus(), [RepaymentStatus::PENDING, RepaymentStatus::PARTIAL, RepaymentStatus::OVERDUE], true)) {
                    $s->setStatus(RepaymentStatus::WAIVED);
                }
            }

            // Update loan terms
            $loan->setTenure($newTenure);
            if ($newRate !== null) {
                $loan->setInterestRate($newRate);
            }

            $loan->transitionTo(LoanStatus::RESTRUCTURED);

            // Generate new repayment schedule from outstanding balance
            $product = $loan->getProduct();
            $calc = $this->calcService->calculate($product, $outstanding, $newTenure);

            $baseDate = new \DateTime();
            for ($i = 0; $i < $newTenure; $i++) {
                $dueDate = (clone $baseDate)->modify('+' . ($i + 1) . ' months');
                $newSchedule = new RepaymentSchedule();
                $newSchedule->setLoan($loan);
                $newSchedule->setLedger($customerLedger);
                $newSchedule->setInstallmentNumber($i + 1);
                $newSchedule->setDueDate($dueDate);

                if (isset($calc['schedule_preview'][$i])) {
                    $newSchedule->setPrincipalAmount($calc['schedule_preview'][$i]['principal']);
                    $newSchedule->setInterestAmount($calc['schedule_preview'][$i]['interest']);
                    $newSchedule->setTotalAmount($calc['schedule_preview'][$i]['total']);
                } else {
                    $newSchedule->setPrincipalAmount($calc['mr_principal']);
                    $newSchedule->setInterestAmount($calc['mr_interest']);
                    $newSchedule->setTotalAmount($calc['mr_principal_interest']);
                }

                $this->em->persist($newSchedule);
            }

            // Transition back to active
            $loan->transitionTo(LoanStatus::ACTIVE);

            $trail = new LoanTrail();
            $trail->setUserId($userId);
            $trail->setAction('Loan restructured');
            $trail->setDetails(['outstanding' => $outstanding, 'new_tenure' => $newTenure, 'new_rate' => $newRate ?? $loan->getInterestRate()]);
            $loan->addTrail($trail);

            $this->em->flush();
            $this->em->commit();

            if ($this->notifService !== null) {
                try {
                    $this->notifService->notifyAgent(
                        $loan->getAgent(),
                        'Loan restructured',
                        "Loan {$loan->getApplicationId()} for {$loan->getCustomer()->getFullName()} has been restructured — new tenure {$newTenure} month(s).",
                        $loan->getCustomer()->getId(),
                    );
                } catch (\Throwable $e) { /* best-effort */ }
            }

            return ['loan_id' => $loan->getId(), 'status' => 'restructured', 'outstanding' => $outstanding, 'new_tenure' => $newTenure];
        } catch (\Exception $e) {
            $this->em->rollback();
            throw new DomainException('Restructuring failed: ' . $e->getMessage());
        }
    }
}
