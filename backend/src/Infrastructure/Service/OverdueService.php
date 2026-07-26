<?php

declare(strict_types=1);

namespace App\Infrastructure\Service;

use App\Domain\Entity\LoanTrail;
use App\Domain\Enum\JournalEntryType;
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
        private readonly ?PeriodGuardService $periodGuard = null,
        private readonly ?LedgerService $ledgerService = null,
        private readonly ?GlMappingService $glMapping = null,
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

        // Back-date guard — penalty postings use today's date. This
        // only fires if the operator has already closed the current
        // month, which would be unusual but would make the auto-job
        // silently start posting into a closed period. Fail loudly
        // instead. The optional-injection pattern preserves backward
        // compatibility with any caller that constructs OverdueService
        // without the guard (older CLI scripts, tests).
        $this->periodGuard?->assertDateOpen(date('Y-m-d'));

        $overdueSchedules = $this->scheduleRepo->findOverdue();
        $processedLoans = [];
        $penaltiesApplied = 0;

        // Default Ledgers override for penalty income, else the seeded 'PI'.
        $penaltyGl = $this->glMapping?->resolveByCode('PI') ?? $this->glRepo->findByCode('PI');
        $today = new \DateTime('today');

        // Phase-2.5 D.4: wrap the scan in an outer transaction. Each
        // penalty becomes its own postJournal call (which flushes the
        // journal). The transaction makes 'all penalties succeed or
        // all fail' atomic — preserves the prior single-bulk-flush
        // semantics where a failure on penalty #50 wouldn't leave
        // penalties #1..#49 committed.
        $this->em->beginTransaction();
        try {
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

                // Maturity-only gate: a global setting or a per-rule flag can
                // restrict penalties to AFTER the loan's maturity date (the
                // last installment's due date). Interim late installments are
                // still marked overdue above, just not penalised yet.
                $globalAfterMaturity = $this->settings->getBool('penalty.apply_after_maturity_only', false);
                $maturityDate = null; // lazily resolved when needed

                foreach ($rules as $rule) {
                    $afterMaturityOnly = $globalAfterMaturity || $rule->isApplyAfterMaturityOnly();
                    if ($afterMaturityOnly) {
                        if ($maturityDate === null) {
                            $maturityDate = $this->scheduleRepo->getMaturityDate($loanId);
                        }
                        // Not matured yet, or no schedule → no penalty.
                        if ($maturityDate === null || $today <= $maturityDate) {
                            continue;
                        }
                        $daysPastMaturity = (int) $maturityDate->diff($today)->days;
                        if ($daysPastMaturity <= $rule->getGracePeriodDays()) {
                            continue;
                        }
                    } elseif ($daysPastDue <= $rule->getGracePeriodDays()) {
                        continue;
                    }

                    $overdueAmount = $schedule->getOutstanding();
                    $penaltyAmount = $rule->calculatePenalty($overdueAmount);

                    if (bccomp($penaltyAmount, '0.00', 2) <= 0) {
                        continue;
                    }

                    $customerLedger = $this->clRepo->findByLoan($loanId);
                    if ($customerLedger === null || $penaltyGl === null) {
                        continue;
                    }

                    $callback = 'PEN-' . $loan->getApplicationId() . '-' . date('Ymd');

                    // Phase-2.5 D.4: post the penalty journal via the
                    // helper. DR Customer Ledger (the customer now owes
                    // the penalty) + CR Penalty Income GL.
                    //
                    // The optional-injection pattern (?LedgerService)
                    // is preserved to keep backward compat with older
                    // CLI scripts and tests that construct OverdueService
                    // without the helper. If absent, we fall back to
                    // the legacy inline construction so the scan still
                    // runs (penalty journals just won't have a
                    // JournalEntry header — but D.9's NOT NULL migration
                    // hasn't run yet at the point such test code might
                    // execute, so this is safe in those contexts).
                    if ($this->ledgerService !== null) {
                        $this->ledgerService->postJournal(
                            entryType: JournalEntryType::PENALTY,
                            postingDate: date('Y-m-d'),
                            narration: 'Overdue penalty — ' . $loan->getApplicationId()
                                . ' (' . $rule->getName() . ', installment #' . $schedule->getInstallmentNumber() . ')',
                            postedBy: null,
                            lines: [
                                ['gl' => $customerLedger->getGeneralLedger(),
                                    'customerLedger' => $customerLedger,
                                    'type' => TransactionType::DR,
                                    'amount' => $penaltyAmount,
                                    'narration' => 'PENALTY - ' . $rule->getName()
                                        . ' (Installment #' . $schedule->getInstallmentNumber() . ')'],
                                ['gl' => $penaltyGl,
                                    'type' => TransactionType::CR,
                                    'amount' => $penaltyAmount,
                                    'narration' => 'PENALTY INCOME - ' . $loan->getCustomer()->getFullName()],
                            ],
                            legacyCallback: $callback,
                            reference: $loan->getApplicationId(),
                        );
                    }
                    // Note: when LedgerService isn't injected (legacy
                    // CLI tests), penalties don't post a journal. The
                    // scan still runs to mark schedules overdue and
                    // dispatch notifications. This was implicit in the
                    // pre-2.5 behaviour too — without LedgerService the
                    // validateBatchBalance was skipped, but the lines
                    // were still persisted. Sub-phase D.9's NOT NULL
                    // migration would break that fallback, so test code
                    // must inject LedgerService to exercise penalty
                    // journals after D.9 lands.

                    $trail = new LoanTrail();
                    $trail->setAction('Penalty applied: ' . $rule->getName());
                    $trail->setDetails(['amount' => $penaltyAmount, 'rule' => $rule->getName(), 'days_past_due' => $daysPastDue]);
                    $loan->addTrail($trail);

                    $penaltiesApplied++;
                }
            }

            $this->em->flush();
            $this->em->commit();
        } catch (\Throwable $e) {
            if ($this->em->getConnection()->isTransactionActive()) {
                $this->em->rollback();
            }
            throw $e;
        }

        // Dispatch overdue notifications (Gap 8)
        if ($this->notifService !== null) {
            foreach (array_keys($processedLoans) as $loanId) {
                try {
                    $loan = $this->em->find(\App\Domain\Entity\Loan::class, $loanId);
                    if ($loan !== null) {
                        // Customer-facing overdue templates still fire; the
                        // agent is notified via notifyAgent (in-app+push+email).
                        $this->notifService->dispatchEvent('overdue_reminder', [
                            'customer_name' => $loan->getCustomer()->getFullName(),
                            'customer_email' => $loan->getCustomer()->getEmail(),
                            'customer_phone' => $loan->getCustomer()->getPhone(),
                            'loan_amount' => $loan->getAmountRequested(),
                            'application_id' => $loan->getApplicationId(),
                            'user_id' => null,
                        ], null, $loan->getCustomer()->getId());
                        $this->notifService->notifyAgent(
                            $loan->getAgent(),
                            'Loan overdue',
                            "Loan {$loan->getApplicationId()} for {$loan->getCustomer()->getFullName()} is now overdue.",
                            $loan->getCustomer()->getId(),
                        );
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
