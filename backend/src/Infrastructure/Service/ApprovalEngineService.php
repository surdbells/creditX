<?php

declare(strict_types=1);

namespace App\Infrastructure\Service;

use App\Domain\Entity\ApprovalCondition;
use App\Domain\Entity\ApprovalStep;
use App\Domain\Entity\ApprovalWorkflow;
use App\Domain\Entity\Loan;
use App\Domain\Entity\LoanApproval;
use App\Domain\Entity\LoanTrail;
use App\Domain\Entity\User;
use App\Domain\Enum\ApprovalMode;
use App\Domain\Enum\ApprovalStatus;
use App\Domain\Enum\LoanStatus;
use App\Domain\Exception\DomainException;
use App\Domain\Repository\ApprovalWorkflowRepository;
use App\Domain\Repository\LoanApprovalRepository;
use App\Infrastructure\Service\NotificationDispatchService;
use Doctrine\ORM\EntityManagerInterface;

final class ApprovalEngineService
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly ApprovalWorkflowRepository $workflowRepo,
        private readonly LoanApprovalRepository $approvalRepo,
        private readonly SettingsCacheService $settings,
        private readonly ?NotificationDispatchService $notifService = null,
    ) {
    }

    /**
     * Initialize approval process for a loan when it's submitted.
     * Creates LoanApproval records for each applicable step.
     *
     * @throws DomainException if no workflow configured
     */
    public function initiate(Loan $loan): void
    {
        $workflow = $this->workflowRepo->findActiveByProductId($loan->getProduct()->getId());

        if ($workflow === null) {
            throw new DomainException('No active approval workflow configured for product: ' . $loan->getProduct()->getName());
        }

        // Get base steps
        $steps = $workflow->getSteps()->toArray();

        // Evaluate conditional steps
        $conditionalRoutingEnabled = $this->settings->getBool('approval.conditional_routing_enabled', true);
        if ($conditionalRoutingEnabled) {
            $additionalSteps = $this->evaluateConditions($workflow, $loan);
            $steps = array_merge($steps, $additionalSteps);
        }

        // Sort by step order
        usort($steps, fn(ApprovalStep $a, ApprovalStep $b) => $a->getStepOrder() <=> $b->getStepOrder());

        // Remove duplicates (same step ID)
        $seen = [];
        $uniqueSteps = [];
        foreach ($steps as $step) {
            if (!isset($seen[$step->getId()])) {
                $seen[$step->getId()] = true;
                $uniqueSteps[] = $step;
            }
        }

        if (empty($uniqueSteps)) {
            throw new DomainException('Workflow has no approval steps configured');
        }

        $now = new \DateTimeImmutable('now', new \DateTimeZone($_ENV['APP_TIMEZONE'] ?? 'Africa/Lagos'));

        // Create LoanApproval records
        foreach ($uniqueSteps as $step) {
            $approval = new LoanApproval();
            $approval->setLoan($loan);
            $approval->setStep($step);

            // For sequential mode, only the first step starts active (SLA clock ticks)
            // For parallel mode, all steps start active
            if ($workflow->getMode() === ApprovalMode::PARALLEL || $step === $uniqueSteps[0]) {
                $approval->setSlaStartedAt($now);
            }

            $this->em->persist($approval);
        }

        // Transition loan to under_review
        $loan->transitionTo(LoanStatus::UNDER_REVIEW);

        // Trail
        $trail = new LoanTrail();
        $trail->setAction('Approval workflow initiated: ' . $workflow->getName() . ' (' . $workflow->getMode()->value . ' mode, ' . count($uniqueSteps) . ' steps)');
        $trail->setDetails([
            'workflow_id' => $workflow->getId(),
            'mode' => $workflow->getMode()->value,
            'steps' => array_map(fn(ApprovalStep $s) => ['id' => $s->getId(), 'name' => $s->getName(), 'role' => $s->getRole()->getSlug()], $uniqueSteps),
        ]);
        $loan->addTrail($trail);

        $this->em->flush();
    }

    /**
     * Process an approval decision (approve or reject) for a specific loan.
     *
     * @return array{loan_status: string, approval_status: string, message: string}
     */
    public function decide(Loan $loan, User $user, string $action, ?string $comment = null): array
    {
        if ($loan->getStatus() !== LoanStatus::UNDER_REVIEW) {
            throw new DomainException('Loan is not under review');
        }

        if (!in_array($action, ['approve', 'reject'], true)) {
            throw new DomainException('Invalid action. Must be "approve" or "reject"');
        }

        $workflow = $this->workflowRepo->findActiveByProductId($loan->getProduct()->getId());
        if ($workflow === null) {
            throw new DomainException('Workflow not found for this loan product');
        }

        // Find the approval record this user can act on
        $approval = $this->findActionableApproval($loan, $user, $workflow);

        if ($approval === null) {
            throw new DomainException('No pending approval step found for your role');
        }

        // Process decision
        if ($action === 'approve') {
            $approval->approve($user, $comment);
        } else {
            $approval->reject($user, $comment);
        }

        // Trail
        $trail = new LoanTrail();
        $trail->setUserId($user->getId());
        $trail->setAction("Step '{$approval->getStep()->getName()}' " . ($action === 'approve' ? 'approved' : 'rejected'));
        $trail->setDetails(['step_id' => $approval->getStep()->getId(), 'comment' => $comment]);
        $loan->addTrail($trail);

        // Determine overall loan status based on all approvals
        $result = $this->evaluateOverallStatus($loan, $workflow);

        $this->em->flush();

        // Dispatch notifications for approval action (Gap 3)
        if ($this->notifService !== null) {
            try {
                $event = $action === 'approve' ? 'loan_approved' : 'loan_rejected';
                if ($result['loan_status'] === LoanStatus::APPROVED->value) $event = 'loan_approved';
                elseif ($result['loan_status'] === LoanStatus::REJECTED->value) $event = 'loan_rejected';
                else $event = 'loan_approval_step';

                $this->notifService->dispatchEvent($event, [
                    'customer_name' => $loan->getCustomer()->getFullName(),
                    'customer_email' => $loan->getCustomer()->getEmail(),
                    'customer_phone' => $loan->getCustomer()->getPhone(),
                    'loan_amount' => $loan->getAmountRequested(),
                    'application_id' => $loan->getApplicationId(),
                    'step_name' => $approval->getStep()->getName(),
                    'action' => $action,
                    'user_id' => $loan->getAgentId(),
                ], $loan->getAgentId(), $loan->getCustomer()->getId());
            } catch (\Exception $e) { /* notification failure should not block */ }
        }

        return $result;
    }

    /**
     * Get the approval queue for a user (loans pending their approval).
     *
     * @return array{items: array, total: int}
     */
    public function getQueue(User $user, int $offset, int $limit, ?string $search = null): array
    {
        /*
         * Two visibility modes:
         *
         *   1. Global visibility — user has 'loans.approve' permission via
         *      ANY role (typically Super Admin, Credit Manager, etc.).
         *      They see every pending approval in the system, regardless
         *      of which step role the approval is routed to. This fixes
         *      the 'queue is empty despite having submitted loans' bug:
         *      before this change, a Super Admin whose roles didn't
         *      include the exact workflow step role saw nothing.
         *
         *   2. Role-scoped visibility — user does NOT have loans.approve
         *      but IS assigned to a role that owns workflow steps. They
         *      see only approvals routed to their specific role(s).
         *      This is the original behavior, preserved for role-based
         *      approvers like Branch Manager, Credit Officer, etc. whose
         *      view should be scoped to their scope of responsibility.
         *
         * The global-visibility path is the superset — a user with
         * loans.approve AND a specific step role still sees everything.
         * This matches how admins expect approval queues to work:
         * permissions gate access, roles provide default routing but
         * don't restrict broad-access users.
         */
        if ($user->hasPermission('loans.approve')) {
            $result = $this->approvalRepo->findAllPendingQueue($offset, $limit, $search);
            $items = $result['items'];
            $total = $result['total'];
        } else {
            $roleIds = $user->getRoles()->map(fn($r) => $r->getId())->toArray();
            if (empty($roleIds)) {
                return ['items' => [], 'total' => 0];
            }

            // Aggregate across all user roles for role-scoped users.
            // The repo-level query already filters by status=PENDING and
            // joins the step; we dedupe by approval id in case a user
            // has multiple roles that match the same step.
            $allItems = [];
            foreach ($roleIds as $roleId) {
                $result = $this->approvalRepo->findPendingForRole($roleId, 0, 1000, $search);
                foreach ($result['items'] as $item) {
                    $allItems[$item->getId()] = $item;
                }
            }

            $items = array_values($allItems);

            // Sort + paginate in PHP since we aggregated across role queries
            usort($items, fn(LoanApproval $a, LoanApproval $b) => $a->getCreatedAt() <=> $b->getCreatedAt());
            $total = count($items);
            $items = array_slice($items, $offset, $limit);
        }

        /*
         * Response shape: flatten the most-needed loan fields into the
         * top-level row so the admin approval-queue DataTable can read
         * them via column.key without nested-path support. The full
         * loan object stays accessible under `loan` for any consumer
         * that wants the whole payload.
         *
         * Also exposes a 'current_step' alias for 'step_name' so the
         * queue's Step column reads naturally — step_name is the
         * approval step's name (e.g. 'Credit Officer Review') and
         * that's what the UI surfaces as the 'current step' for the
         * loan.
         */
        $output = array_map(function (LoanApproval $a) {
            $loanData = $a->getLoan()->toArray();
            return array_merge($a->toArray(), [
                'loan'             => $loanData,
                // Flattened loan fields for flat DataTable rendering
                'application_id'   => $loanData['application_id'] ?? null,
                'customer_name'    => $loanData['customer_name'] ?? null,
                'customer_staff_id' => $loanData['customer_staff_id'] ?? null,
                'product_name'     => $loanData['product_name'] ?? null,
                'amount_requested' => $loanData['amount_requested'] ?? null,
                'loan_status'      => $loanData['status'] ?? null,
                // Alias for display: 'current_step' reads as the step
                // the loan is currently at, which is this approval's
                // step_name for sequential mode or the earliest pending
                // step name for parallel mode.
                'current_step'     => $a->getStep()->getName(),
            ]);
        }, $items);

        return ['items' => $output, 'total' => $total];
    }

    /**
     * Get all approvals for a loan.
     */
    public function getLoanApprovals(string $loanId): array
    {
        $approvals = $this->approvalRepo->findByLoan($loanId);
        return array_map(fn(LoanApproval $a) => $a->toArray(), $approvals);
    }

    /**
     * Check and process SLA breaches (called by scheduled job).
     */
    public function processSlaBreaches(): array
    {
        $autoEscalation = $this->settings->getBool('approval.auto_escalation_enabled', false);
        $candidates = $this->approvalRepo->findSlaBreachCandidates();
        $processed = [];

        $now = new \DateTimeImmutable('now', new \DateTimeZone($_ENV['APP_TIMEZONE'] ?? 'Africa/Lagos'));

        foreach ($candidates as $approval) {
            $slaHours = $approval->getStep()->getSlaHours();
            if ($slaHours === null || $approval->getSlaStartedAt() === null) {
                continue;
            }

            $elapsedHours = ($now->getTimestamp() - $approval->getSlaStartedAt()->getTimestamp()) / 3600;

            if ($elapsedHours >= $slaHours) {
                $approval->setSlaBreached(true);

                $autoApproveHours = $approval->getStep()->getAutoApproveAfterHours();
                if ($autoEscalation && $autoApproveHours !== null && $elapsedHours >= $autoApproveHours) {
                    $approval->autoApprove();

                    $trail = new LoanTrail();
                    $trail->setAction("Step '{$approval->getStep()->getName()}' auto-approved after SLA breach");
                    $approval->getLoan()->addTrail($trail);

                    // Re-evaluate overall status
                    $workflow = $this->workflowRepo->findActiveByProductId($approval->getLoan()->getProduct()->getId());
                    if ($workflow) {
                        $this->evaluateOverallStatus($approval->getLoan(), $workflow);
                    }
                } else {
                    $approval->escalate();
                }

                $processed[] = [
                    'loan_id' => $approval->getLoan()->getId(),
                    'step' => $approval->getStep()->getName(),
                    'action' => $approval->getStatus()->value,
                    'elapsed_hours' => round($elapsedHours, 1),
                ];
            }
        }

        if (!empty($processed)) {
            $this->em->flush();
        }

        return $processed;
    }

    // ─── Private helpers ───

    private function evaluateConditions(ApprovalWorkflow $workflow, Loan $loan): array
    {
        $additional = [];
        foreach ($workflow->getConditions() as $condition) {
            if (!$condition->isActive()) continue;
            if ($condition->evaluate($loan)) {
                $additional[] = $condition->getAdditionalStep();
            }
        }
        return $additional;
    }

    private function findActionableApproval(Loan $loan, User $user, ApprovalWorkflow $workflow): ?LoanApproval
    {
        $userRoleSlugs = $user->getRoles()->map(fn($r) => $r->getSlug())->toArray();

        if ($workflow->getMode() === ApprovalMode::SEQUENTIAL) {
            // In sequential mode, only the next pending step can be acted on
            $next = $this->approvalRepo->findNextPending($loan->getId());
            if ($next !== null && in_array($next->getStep()->getRole()->getSlug(), $userRoleSlugs, true)) {
                return $next;
            }
            return null;
        }

        // Parallel mode — user can act on any pending step matching their role
        $pending = $this->approvalRepo->findAllPending($loan->getId());
        foreach ($pending as $approval) {
            if (in_array($approval->getStep()->getRole()->getSlug(), $userRoleSlugs, true)) {
                return $approval;
            }
        }
        return null;
    }

    private function evaluateOverallStatus(Loan $loan, ApprovalWorkflow $workflow): array
    {
        $approvals = $this->approvalRepo->findByLoan($loan->getId());

        $allDecided = true;
        $anyMandatoryRejected = false;
        $allMandatoryApproved = true;

        foreach ($approvals as $approval) {
            if ($approval->isPending() || $approval->getStatus() === ApprovalStatus::ESCALATED) {
                $allDecided = false;

                // In sequential mode, start SLA clock for next step
                if ($workflow->getMode() === ApprovalMode::SEQUENTIAL && $approval->getSlaStartedAt() === null) {
                    // Check if all previous steps are decided
                    $previousAllDone = true;
                    foreach ($approvals as $prev) {
                        if ($prev->getStep()->getStepOrder() < $approval->getStep()->getStepOrder() && !$prev->isDecided()) {
                            $previousAllDone = false;
                            break;
                        }
                    }
                    if ($previousAllDone) {
                        $approval->setSlaStartedAt(new \DateTimeImmutable('now', new \DateTimeZone($_ENV['APP_TIMEZONE'] ?? 'Africa/Lagos')));
                    }
                }
            }

            if ($approval->getStatus() === ApprovalStatus::REJECTED && $approval->getStep()->isMandatory()) {
                $anyMandatoryRejected = true;
            }

            if ($approval->getStep()->isMandatory() && !in_array($approval->getStatus(), [ApprovalStatus::APPROVED, ApprovalStatus::AUTO_APPROVED], true)) {
                $allMandatoryApproved = false;
            }
        }

        // Rejection — immediate if any mandatory step rejected
        if ($anyMandatoryRejected) {
            $loan->transitionTo(LoanStatus::REJECTED);
            $trail = new LoanTrail();
            $trail->setAction('Loan rejected — mandatory approval step rejected');
            $loan->addTrail($trail);
            return ['loan_status' => LoanStatus::REJECTED->value, 'approval_status' => 'rejected', 'message' => 'Loan has been rejected'];
        }

        // Full approval
        if ($allMandatoryApproved && ($allDecided || $workflow->getMode() === ApprovalMode::PARALLEL)) {
            // In parallel mode, we only need all mandatory steps approved
            $nonMandatoryPending = false;
            foreach ($approvals as $a) {
                if (!$a->getStep()->isMandatory() && $a->isPending()) {
                    $nonMandatoryPending = true;
                }
            }

            if (!$nonMandatoryPending || $workflow->getMode() === ApprovalMode::PARALLEL) {
                $loan->transitionTo(LoanStatus::APPROVED);
                $trail = new LoanTrail();
                $trail->setAction('Loan approved — all mandatory approval steps completed');
                $loan->addTrail($trail);
                return ['loan_status' => LoanStatus::APPROVED->value, 'approval_status' => 'approved', 'message' => 'Loan has been approved'];
            }
        }

        return ['loan_status' => LoanStatus::UNDER_REVIEW->value, 'approval_status' => 'pending', 'message' => 'Approval in progress'];
    }
}
