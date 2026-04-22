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

        /*
         * Race-condition protection via explicit transaction + pessimistic
         * row lock.
         *
         * Without this, two reviewers in the same role clicking Approve
         * on the same loan step at the same instant would both:
         *   1. Read the approval row (status=PENDING)
         *   2. Call approve() (mutates in memory)
         *   3. flush() (DB UPDATE)
         * Last-write-wins: whichever request committed second silently
         * overwrites the other's approver_id + decided_at. Two trails
         * land but only one approver is recorded. For a loan with
         * thousands of dollars at stake, this is an auditability hole.
         *
         * Fix: open an explicit transaction, re-fetch the identified
         * approval row WITH LockMode::PESSIMISTIC_WRITE (PostgreSQL
         * translates this to SELECT ... FOR UPDATE). Other transactions
         * trying to act on the same row block until this one commits or
         * rolls back. The second reviewer's request then sees the
         * committed result and the state guard in approve()/reject()
         * catches the 'already decided' case cleanly.
         */
        $this->em->beginTransaction();
        try {
            // Identify the candidate approval (no lock yet — findActionable
            // uses indexed queries that would hold too many row locks).
            $candidate = $this->findActionableApproval($loan, $user, $workflow);
            if ($candidate === null) {
                $this->em->rollback();
                throw new DomainException('No pending approval step found for your role');
            }

            // Re-fetch with a pessimistic write lock so concurrent deciders
            // serialize here. The second request blocks on this line until
            // the first commits, then retrieves the row in its new state
            // and the state guard in approve()/reject() rejects it.
            $approval = $this->em->find(
                LoanApproval::class,
                $candidate->getId(),
                \Doctrine\DBAL\LockMode::PESSIMISTIC_WRITE,
            );
            if ($approval === null) {
                $this->em->rollback();
                throw new DomainException('Approval record could not be locked');
            }

            // Defensive status check before calling the entity mutator.
            // approve()/reject() also guard against non-PENDING state
            // (commit L — entity-level defense) but a 400 from this
            // service-level check is cheaper to produce and carries a
            // clearer message for the admin UI to toast.
            if (!$approval->isPending()) {
                $this->em->rollback();
                throw new DomainException(
                    'This approval step has already been decided by another reviewer'
                );
            }

            // Process decision — these now throw if the row is not
            // PENDING (belt + suspenders vs the check above which can
            // race if we ever remove the lock).
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

            /*
             * Flush the decision BEFORE evaluating overall loan status.
             *
             * evaluateOverallStatus() calls approvalRepo->findByLoan()
             * which issues a fresh DB query. Without this flush, the
             * query reads the PRE-decision state from the DB (this
             * approval still PENDING in storage, even though it's
             * APPROVED in memory). Depending on Doctrine's identity
             * map the returned entities may or may not reflect the
             * in-memory mutation — inconsistent and unreliable.
             *
             * With the flush, the UPDATE lands in the DB (still inside
             * our transaction thanks to beginTransaction above), and
             * the subsequent repo query sees the just-decided state.
             * evaluateOverallStatus can then correctly determine
             * whether this was the final step needed to approve or
             * reject the loan.
             *
             * Without this flush: approval trail on loan detail page
             * shows the step as 'pending' even after successful
             * approval, and the loan stays in under_review forever
             * because evaluateOverallStatus never sees the APPROVED
             * status it just set.
             *
             * The transaction still wraps both flushes so partial
             * failures roll everything back. The pessimistic lock on
             * the approval row is also still held until commit.
             */
            $this->em->flush();

            // Determine overall loan status based on all approvals
            $result = $this->evaluateOverallStatus($loan, $workflow);

            // Second flush: persist any loan status transition +
            // loan-level trail that evaluateOverallStatus created.
            $this->em->flush();
            $this->em->commit();
        } catch (DomainException $e) {
            // A DomainException may come from two places:
            //   (a) Explicit throws above with rollback() already done
            //       (candidate null, approval null, non-pending state)
            //   (b) Entity-level guards in approve()/reject() when the
            //       state changed between our check and the mutator call
            //       — no rollback() has fired yet
            // Safe to always attempt rollback; Doctrine no-ops if no tx
            // is active and we ensure the tx is closed either way.
            if ($this->em->getConnection()->isTransactionActive()) {
                $this->em->rollback();
            }
            throw $e;
        } catch (\Throwable $e) {
            if ($this->em->getConnection()->isTransactionActive()) {
                $this->em->rollback();
            }
            throw new DomainException('Failed to record decision: ' . $e->getMessage());
        }

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
                    'user_id' => $loan->getAgent()?->getId(),
                    // Reviewer's comment — drives the rejection-reason
                    // template (see seed-loan-rejected-templates.php).
                    // For approvals, comment is optional and may be null.
                    // Template engine's missing-variable tolerance handles
                    // the null case gracefully ({comment} renders empty).
                    'comment' => $comment ?? '',
                    // Reviewer name so the agent knows who decided
                    'reviewer_name' => $user->getFullName(),
                ], $loan->getAgent()?->getId(), $loan->getCustomer()->getId());
            } catch (\Exception $e) { /* notification failure should not block */ }
        }

        // ─── Auto-create loan-scoped conversation on rejection ───
        //
        // When a reviewer rejects a loan (either a mandatory step that
        // fails the whole loan, or a non-mandatory step with a specific
        // concern), the reason needs to reach the originating agent as
        // a message they can see, respond to, and track. Notifications
        // alone aren't enough — agents may want to follow up with the
        // reviewer, and a DM thread gives them a place to do that.
        //
        // We only auto-create on rejection (not approval) because the
        // approval path already dispatches a push + email + in-app
        // notification, and there's typically no need for further
        // conversation. Rejected loans almost always spark an agent
        // question: 'why?' / 'how to fix?' / 'appeal?'.
        //
        // The conversation is scoped to the loan (loan_id set) so it
        // shows up filterable in the agent's inbox alongside any other
        // messages about the loan.
        if ($action === 'reject' && $comment && $loan->getAgent() !== null) {
            try {
                $agent = $loan->getAgent();
                if ($agent !== null) {
                    $conv = new \App\Domain\Entity\Conversation();
                    $conv->setAgent($agent);
                    $conv->setLoanId($loan->getId());

                    // Subject mirrors the loan-reject template's tone —
                    // scannable at a glance in the inbox list.
                    $subject = $result['loan_status'] === LoanStatus::REJECTED->value
                        ? "Loan {$loan->getApplicationId()} rejected"
                        : "Step '{$approval->getStep()->getName()}' rejected for {$loan->getApplicationId()}";
                    $conv->setSubject($subject);

                    // Message body carries the reviewer's reason verbatim
                    // plus context so the agent doesn't have to go look
                    // anything up.
                    $msg = new \App\Domain\Entity\Message();
                    $msg->setSenderId($user->getId());
                    $body = "Your loan application {$loan->getApplicationId()} "
                        . "for {$loan->getCustomer()->getFullName()} "
                        . "was rejected at the '{$approval->getStep()->getName()}' step "
                        . "by {$user->getFullName()}.\n\n"
                        . "Reason:\n{$comment}";
                    $msg->setBody($body);
                    $conv->addMessage($msg);

                    $this->em->persist($conv);
                    $this->em->flush();
                }
            } catch (\Exception $e) {
                // Conversation creation is best-effort. The notification
                // went out; if the DM fails (e.g. orphaned agent_id),
                // the agent still gets the push/email. Don't let this
                // secondary channel failure block the primary decision
                // from committing.
            }
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

        /*
         * Global-authority mode — parallels the queue's global-visibility
         * mode (see getQueue). A user with the 'loans.approve' permission
         * can decide on ANY pending step, regardless of which role the
         * step is routed to. Super Admin, Credit Manager, and similar
         * elevated roles should be able to act on the queue they can see.
         *
         * Without this, a Super Admin with loans.approve saw loans in
         * their queue but got 'No pending approval step found for your
         * role' when they clicked Approve — the role-scoped decision
         * check refused them even though the visibility check admitted
         * them. Reported as 'decide endpoint returns No pending approval
         * step found for your role from the approval queue' this session.
         *
         * For role-scoped users (no loans.approve permission), the
         * original behavior applies — they can only decide on steps
         * routed to their specific role.
         */
        $hasGlobalAuthority = $user->hasPermission('loans.approve');

        if ($workflow->getMode() === ApprovalMode::SEQUENTIAL) {
            // In sequential mode, only the next pending step can be acted on
            $next = $this->approvalRepo->findNextPending($loan->getId());
            if ($next === null) {
                return null;
            }
            if ($hasGlobalAuthority) {
                return $next;
            }
            if (in_array($next->getStep()->getRole()->getSlug(), $userRoleSlugs, true)) {
                return $next;
            }
            return null;
        }

        // Parallel mode — user can act on any pending step matching their
        // role (or any pending step at all if they have global authority).
        $pending = $this->approvalRepo->findAllPending($loan->getId());
        if ($hasGlobalAuthority && !empty($pending)) {
            // Global authority: act on the earliest-created pending step
            // by default (matches the queue's sort order).
            return $pending[0];
        }
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
