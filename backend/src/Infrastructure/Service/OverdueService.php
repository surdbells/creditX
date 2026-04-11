<?php

declare(strict_types=1);

namespace App\Infrastructure\Service;

use App\Domain\Entity\LedgerTransaction;
use App\Domain\Entity\LoanTrail;
use App\Domain\Enum\LoanStatus;
use App\Domain\Enum\RepaymentStatus;
use App\Domain\Enum\TransactionType;
use App\Domain\Repository\GeneralLedgerRepository;
use App\Domain\Repository\CustomerLedgerRepository;
use App\Domain\Repository\PenaltyRuleRepository;
use App\Domain\Repository\RepaymentScheduleRepository;
use Doctrine\ORM\EntityManagerInterface;

final class OverdueService
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly RepaymentScheduleRepository $scheduleRepo,
        private readonly PenaltyRuleRepository $penaltyRepo,
        private readonly GeneralLedgerRepository $glRepo,
        private readonly CustomerLedgerRepository $clRepo,
        private readonly SettingsCacheService $settings,
        private readonly ?NotificationDispatchService $notifService = null,
    ) {
    }

    /**
     * Run daily overdue detection and penalty application.
     * Called by scheduled job.
     *
     * @return array{overdue_loans: int, penalties_applied: int, details: array}
     */
    public function processOverdue(): array
    {
        if (!$this->settings->getBool('penalty.overdue_check_enabled', true)) {
            return ['overdue_loans' => 0, 'penalties_applied' => 0, 'details' => [], 'message' => 'Overdue check is disabled'];
        }

        $overdueSchedules = $this->scheduleRepo->findOverdue();
        $processedLoans = [];
        $penaltiesApplied = 0;

        $penaltyGl = $this->glRepo->findByCode('PI');
        $today = new \DateTime('today');

        foreach ($overdueSchedules as $schedule) {
            $loan = $schedule->getLoan();
            $loanId = $loan->getId();

            // Mark schedule as overdue
            $schedule->setStatus(RepaymentStatus::OVERDUE);

            // Transition loan to overdue if not already
            if ($loan->getStatus() === LoanStatus::ACTIVE) {
                try {
                    $loan->transitionTo(LoanStatus::OVERDUE);
                    $trail = new LoanTrail();
                    $trail->setAction('Loan marked overdue — missed payment for installment #' . $schedule->getInstallmentNumber());
                    $trail->setDetails(['due_date' => $schedule->getDueDate()->format('Y-m-d'), 'outstanding' => $schedule->getOutstanding()]);
                    $loan->addTrail($trail);
                } catch (\Exception) {
                    // Already overdue or can't transition
                }
            }

            // Apply penalty if not already processed for this loan today
            if (isset($processedLoans[$loanId])) {
                continue;
            }
            $processedLoans[$loanId] = true;

            // Calculate days past due
            $daysPastDue = (int) $schedule->getDueDate()->diff($today)->days;

            // Get penalty rules for this product
            $rules = $this->penaltyRepo->findActiveByProduct($loan->getProduct()->getId());

            foreach ($rules as $rule) {
                if ($daysPastDue <= $rule->getGracePeriodDays()) {
                    continue;
                }

                $overdueAmount = $schedule->getOutstanding();
                $penaltyAmount = $rule->calculatePenalty($overdueAmount);

                if (bccomp($penaltyAmount, '0.00', 2) <= 0) {
                    continue;
                }

                // Post penalty journal entries
                $customerLedger = $this->clRepo->findByLoan($loanId);
                if ($customerLedger === null || $penaltyGl === null) {
                    continue;
                }

                $callback = 'PEN-' . $loan->getApplicationId() . '-' . date('Ymd');
                $dateParts = [date('Y'), date('m'), date('d')];

                // DR Penalty Receivable (customer ledger)
                $drEntry = new LedgerTransaction();
                $drEntry->setGeneralLedger($customerLedger->getGeneralLedger());
                $drEntry->setCustomerLedger($customerLedger);
                $drEntry->setTransType(TransactionType::DR);
                $drEntry->setTransAmount($penaltyAmount);
                $drEntry->setTransNarration('PENALTY - ' . $rule->getName() . ' (Installment #' . $schedule->getInstallmentNumber() . ')');
                $drEntry->setTransCallback($callback);
                $drEntry->setTransDate($dateParts[0], $dateParts[1], $dateParts[2]);
                $this->em->persist($drEntry);

                // CR Penalty Income
                $crEntry = new LedgerTransaction();
                $crEntry->setGeneralLedger($penaltyGl);
                $crEntry->setTransType(TransactionType::CR);
                $crEntry->setTransAmount($penaltyAmount);
                $crEntry->setTransNarration('PENALTY INCOME - ' . $loan->getCustomer()->getFullName());
                $crEntry->setTransCallback($callback);
                $crEntry->setTransDate($dateParts[0], $dateParts[1], $dateParts[2]);
                $this->em->persist($crEntry);

                $trail = new LoanTrail();
                $trail->setAction('Penalty applied: ' . $rule->getName());
                $trail->setDetails(['amount' => $penaltyAmount, 'rule' => $rule->getName(), 'days_past_due' => $daysPastDue]);
                $loan->addTrail($trail);

                $penaltiesApplied++;
            }
        }

        $this->em->flush();

        // Dispatch overdue notifications (Gap 8)
        if ($this->notifService !== null) {
            foreach (array_keys($processedLoans) as $loanId) {
                try {
                    $loan = $this->em->find(\App\Domain\Entity\Loan::class, $loanId);
                    if ($loan !== null) {
                        $this->notifService->dispatchEvent('overdue_reminder', [
                            'customer_name' => $loan->getCustomer()->getFullName(),
                            'customer_email' => $loan->getCustomer()->getEmail(),
                            'customer_phone' => $loan->getCustomer()->getPhone(),
                            'loan_amount' => $loan->getAmountRequested(),
                            'application_id' => $loan->getApplicationId(),
                            'user_id' => $loan->getAgentId(),
                        ], $loan->getAgentId(), $loan->getCustomer()->getId());
                    }
                } catch (\Exception $e) { /* notification failure should not block */ }
            }
        }

        return [
            'overdue_loans' => count($processedLoans),
            'penalties_applied' => $penaltiesApplied,
            'details' => array_keys($processedLoans),
        ];
    }
}
