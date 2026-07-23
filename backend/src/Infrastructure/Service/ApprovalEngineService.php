<?php

declare(strict_types=1);

namespace App\Infrastructure\Service;

use App\Domain\Entity\ApprovalCondition;
use App\Domain\Entity\ApprovalStep;
use App\Domain\Entity\ApprovalWorkflow;
use App\Domain\Entity\CreditCheck;
use App\Domain\Entity\Loan;
use App\Domain\Entity\LoanApproval;
use App\Domain\Entity\LoanTrail;
use App\Domain\Entity\User;
use App\Domain\Enum\ApprovalMode;
use App\Domain\Enum\ApprovalStatus;
use App\Domain\Enum\LoanStatus;
use App\Domain\Enum\LoanType;
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
        private readonly ?BranchScopeService $branchScope = null,
        // Optional so the engine still constructs if the bureau isn't wired;
        // automated credit-check steps are simply skipped when it's absent.
        private readonly ?FirstCentralService $firstCentral = null,
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

        // Get base steps. Steps flagged is_conditional are NOT part of the
        // always-on pipeline — they only enter the flow when an
        // ApprovalCondition that targets them evaluates true (see below).
        // Without this filter a conditional step would run on every loan,
        // making the whole condition mechanism inert.
        $steps = array_values(array_filter(
            $workflow->getSteps()->toArray(),
            fn(ApprovalStep $s) => !$s->isConditional()
        ));

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
     * Run any ACTIVE automated (credit-check) steps for a loan and auto-decide
     * them. Called AFTER initiate() and after each human decide() so a
     * credit-check step that has just become active is processed immediately.
     *
     * Deliberately NOT called inside a DB transaction / lock: it makes an
     * external FirstCentral HTTP call, which must not hold a row lock. Each
     * decision is flushed and then re-evaluated, so a credit-check step
     * followed by another credit-check step is handled in one pass; a human
     * step in between stops the loop (left pending).
     *
     * On no-hit, error, no numeric score, or a score between the fail/pass
     * thresholds, the step is left PENDING for the role to decide — a bureau
     * outage never auto-approves or auto-rejects lending.
     */
    public function processAutomatedSteps(Loan $loan, ?string $actorId = null): void
    {
        if ($this->firstCentral === null || !$this->firstCentral->isEnabled()) {
            return;
        }

        // Bounded loop — guards against a misconfigured workflow of all
        // credit-check steps looping unexpectedly.
        for ($i = 0; $i < 12; $i++) {
            if ($loan->getStatus() !== LoanStatus::UNDER_REVIEW) return;

            $approval = $this->findActiveCreditCheckApproval($loan->getId());
            if ($approval === null) return;

            $customer = $loan->getCustomer();
            $bvn = $customer->getBvn();
            $dob = $customer->getDateOfBirth()?->format('d/m/Y');
            $result = $bvn
                ? $this->firstCentral->checkConsumer($bvn)
                : $this->firstCentral->checkConsumer(null, $customer->getFullName(), $dob);

            $pass = $this->settings->getInt('credit_bureau.pass_threshold', 600);
            $fail = $this->settings->getInt('credit_bureau.fail_threshold', 400);
            $score = $result['score'];
            $band = $result['risk_band'] ?? '';

            $check = new CreditCheck();
            $check->setLoan($loan);
            $check->setCustomer($customer);
            $check->setSubjectType('consumer');
            $check->setIdentifier($bvn ?: $customer->getFullName());
            $check->setStatus($result['status']);
            $check->setScore($score);
            $check->setRiskBand($result['risk_band']);
            $check->setProviderRef($result['provider_ref']);
            $check->setSummary($result['summary'] ?: null);
            $check->setRawResponse($result['raw'] ?: null);
            $check->setErrorMessage($result['error']);

            $decisive = $result['status'] === 'hit' && $score !== null;

            if ($decisive && $score >= $pass) {
                $reason = "Credit check auto-approved — score {$score}" . ($band !== '' ? " ({$band})" : '');
                $approval->systemApprove($reason);
                $check->setDecision('auto_pass');
                $this->addCreditTrail($loan, $reason, $result);
            } elseif ($decisive && $score <= $fail) {
                $reason = "Credit check auto-rejected — score {$score}" . ($band !== '' ? " ({$band})" : '');
                $approval->systemReject($reason);
                $check->setDecision('auto_fail');
                $this->addCreditTrail($loan, $reason, $result, $reason);
            } else {
                // No auto-decision: score between thresholds, no-hit, error, or
                // no numeric score → leave PENDING for the role to review.
                $check->setDecision('manual');
                $note = match ($result['status']) {
                    'no_hit' => 'Credit check: no bureau record found — manual review.',
                    'error'  => 'Credit check unavailable (' . ($result['error'] ?? 'error') . ') — manual review.',
                    default  => $score !== null
                        ? "Credit check: score {$score}" . ($band !== '' ? " ({$band})" : '') . ' is between thresholds — manual review.'
                        : 'Credit report retrieved without a numeric score — manual review.',
                };
                $this->addCreditTrail($loan, $note, $result);
                $this->em->persist($check);
                $this->em->flush();
                return; // stop — a human handles this step
            }

            $this->em->persist($check);
            $this->evaluateOverallStatus($loan, $approval->getStep()->getWorkflow(), null);
            $this->em->flush();
            // loop: the next step may now be active (possibly another credit check)
        }
    }

    /** The loan's currently-active (SLA started), pending, credit-check approval, if any. */
    private function findActiveCreditCheckApproval(string $loanId): ?LoanApproval
    {
        return $this->em->createQueryBuilder()->select('a')->from(LoanApproval::class, 'a')
            ->innerJoin('a.step', 's')
            ->where('a.loan = :lid')
            ->andWhere('a.status = :pending')
            ->andWhere('a.slaStartedAt IS NOT NULL')
            ->andWhere('s.type = :ctype')
            ->setParameter('lid', $loanId)
            ->setParameter('pending', ApprovalStatus::PENDING->value)
            ->setParameter('ctype', 'credit_check')
            ->orderBy('s.stepOrder', 'ASC')
            ->setMaxResults(1)
            ->getQuery()->getOneOrNullResult();
    }

    /** Record a credit-check outcome on the loan trail. `rejectReason` populates details.comment so the agent's rejection banner shows it. */
    private function addCreditTrail(Loan $loan, string $action, array $result, ?string $rejectReason = null): void
    {
        $trail = new LoanTrail();
        $trail->setAction($action);
        $trail->setDetails(array_filter([
            'source'    => 'firstcentral',
            'status'    => $result['status'] ?? null,
            'score'     => $result['score'] ?? null,
            'risk_band' => $result['risk_band'] ?? null,
            'comment'   => $rejectReason,
        ], fn($v) => $v !== null));
        $loan->addTrail($trail);
    }

    /**
     * Process an approval decision (approve or reject) for a specific loan.
     *
     * @return array{loan_status: string, approval_status: string, message: string}
     */
    public function decide(Loan $loan, User $user, string $action, ?string $comment = null, ?string $topUpBalance = null): array
    {
        if ($loan->getStatus() !== LoanStatus::UNDER_REVIEW) {
            throw new DomainException('Loan is not under review');
        }

        if (!in_array($action, ['approve', 'reject'], true)) {
            throw new DomainException('Invalid action. Must be "approve" or "reject"');
        }

        // Branch scoping: a reviewer may only process loans from a branch they
        // are assigned to. Admins/super-admins are unscoped (null). A scoped
        // reviewer with no branches, or acting on a loan outside their
        // branches (or a branchless loan), is refused — this mirrors the queue
        // visibility filter but enforces it on the write path too, so a decision
        // can't be POSTed for an out-of-branch loan by id.
        if ($this->branchScope !== null) {
            $allowedBranchIds = $this->branchScope->getUserBranchIds($user);
            if ($allowedBranchIds !== null) {
                $loanBranchId = $loan->getBranch()?->getId();
                if ($loanBranchId === null || !in_array($loanBranchId, $allowedBranchIds, true)) {
                    throw new DomainException('You are not assigned to this loan\'s branch.');
                }
            }
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

            // The underwriter step is restricted: only an underwriter (the step
            // role), an admin, or a super admin may decide it — even a
            // broad-access approver (loans.approve) on another role can't.
            if ($approval->getStep()->getRole()->getSlug() === 'underwriter') {
                $userRoleSlugs = $user->getRoles()->map(fn($r) => $r->getSlug())->toArray();
                if (empty(array_intersect(['underwriter', 'admin', 'super_admin'], $userRoleSlugs))) {
                    $this->em->rollback();
                    throw new DomainException('Only an underwriter, admin, or super admin can decide the underwriter step.');
                }
            }

            // Process decision — these now throw if the row is not
            // PENDING (belt + suspenders vs the check above which can
            // race if we ever remove the lock).
            if ($action === 'approve') {
                $approval->approve($user, $comment);
            } else {
                $approval->reject($user, $comment);
            }

            // Underwriter top-up balance override.
            //
            // When the step's role slug is 'underwriter' AND the action is
            // 'approve' AND a top-up value was supplied in the request,
            // persist it on the loan. DisbursementService later reads
            // this via getEffectiveTopUpBalance() and locks the field in
            // the disbursement UI so the operator can't silently revert
            // to the agent's application-time value.
            //
            // Only applied on 'approve' — rejections don't carry a top-up
            // meaning. Only applied when role='underwriter' — other
            // approvers (e.g. credit, compliance) don't set top-up even
            // if they pass a value in the request. Silently ignored in
            // the non-underwriter case rather than erroring, because a
            // parallel-approval workflow could legitimately have multiple
            // approvers decide in one round trip.
            if (
                $action === 'approve'
                && $topUpBalance !== null
                && $approval->getStep()->getRole()->getSlug() === 'underwriter'
            ) {
                // Validate as a decimal string. Application-layer validation
                // should have already rejected garbage, but defend here too
                // in case the action plumbing is bypassed.
                $normalised = number_format((float) $topUpBalance, 2, '.', '');
                if (bccomp($normalised, '0.00', 2) < 0) {
                    $this->em->rollback();
                    throw new DomainException('Top-up balance cannot be negative');
                }
                $loan->setTopUpBalanceUnderwriter($normalised);

                $trail = new LoanTrail();
                $trail->setUserId($user->getId());
                $trail->setAction('Underwriter set top-up balance to ₦' . $normalised);
                $loan->addTrail($trail);
            }

            // Top-up loans must carry a positive top-up balance. Enforce at the
            // underwriter approve step (where the balance is set), so a top-up
            // can't be approved with a zero/blank balance.
            if (
                $action === 'approve'
                && $approval->getStep()->getRole()->getSlug() === 'underwriter'
                && $loan->getLoanType() === LoanType::TOP_UP
            ) {
                $effective = $loan->getEffectiveTopUpBalance();
                if ($effective === null || bccomp(number_format((float) $effective, 2, '.', ''), '0.00', 2) <= 0) {
                    $this->em->rollback();
                    throw new DomainException('This is a top-up loan — enter a top-up balance greater than zero before approving.');
                }
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

            // Determine overall loan status based on all approvals.
            // Pass $user through so document auto-verification (on full
            // approval) attributes the verification to the approving
            // user rather than failing on an undefined variable.
            $result = $this->evaluateOverallStatus($loan, $workflow, $user);

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

                // Customer-facing templates (e.g. rejection email) still fire
                // via the event system. Agent-facing (user_id) is left null so
                // the agent isn't double-notified — notifyAgent() below owns
                // the agent's in-app + push + email delivery.
                $this->notifService->dispatchEvent($event, [
                    'customer_name' => $loan->getCustomer()->getFullName(),
                    'customer_email' => $loan->getCustomer()->getEmail(),
                    'customer_phone' => $loan->getCustomer()->getPhone(),
                    'loan_amount' => $loan->getAmountRequested(),
                    'application_id' => $loan->getApplicationId(),
                    'step_name' => $approval->getStep()->getName(),
                    'action' => $action,
                    'user_id' => null,
                    // Reviewer's comment — drives the rejection-reason
                    // template (see seed-loan-rejected-templates.php).
                    'comment' => $comment ?? '',
                    // Reviewer name so the agent knows who decided
                    'reviewer_name' => $user->getFullName(),
                ], null, $loan->getCustomer()->getId());

                // Notify the field agent (in-app + push + email) with copy
                // matched to what actually happened.
                [$subject, $body] = match ($event) {
                    'loan_approved' => ['Loan approved',
                        "Loan {$loan->getApplicationId()} for {$loan->getCustomer()->getFullName()} has been approved."],
                    'loan_rejected' => ['Loan rejected',
                        "Loan {$loan->getApplicationId()} for {$loan->getCustomer()->getFullName()} was rejected"
                        . ($comment ? " — {$comment}" : '.')],
                    default => ["Loan {$action}d at {$approval->getStep()->getName()}",
                        "{$user->getFullName()} {$action}d the '{$approval->getStep()->getName()}' step on loan {$loan->getApplicationId()} for {$loan->getCustomer()->getFullName()}."],
                };
                $this->notifService->notifyAgent($loan->getAgent(), $subject, $body, $loan->getCustomer()->getId());
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
    public function getQueue(User $user, int $offset, int $limit, ?string $search = null, ?string $filterBranchId = null, string $sortBy = 'created_at', string $sortDir = 'DESC', ?string $roleId = null, ?string $stepName = null, ?string $productId = null, ?string $agentId = null): array
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
         *
         * Branch scoping: both paths also pass a branch-id whitelist
         * down to the repository when the user is NOT admin/super_admin.
         * Underwriters and operations heads only see loans from their
         * assigned branches (User.locations ManyToMany). Admin and
         * super_admin bypass the scope and see every branch — so an
         * operations head with loans.approve still goes down the
         * global-visibility path, but only sees loans from branches
         * assigned to them.
         */
        $branchIds = $this->branchScope?->getUserBranchIds($user);

        // Optional "filter by location" from the queue UI. Lets a broad-access
        // reviewer (e.g. an underwriter who also holds an admin role, and so is
        // otherwise unscoped) narrow the queue to a single assigned location.
        // Never widens access: a scoped user can only narrow within their own
        // branches; an out-of-scope selection is ignored.
        if ($filterBranchId !== null && $filterBranchId !== '') {
            if ($branchIds === null || in_array($filterBranchId, $branchIds, true)) {
                $branchIds = [$filterBranchId];
            }
        }

        if ($user->hasPermission('loans.approve')) {
            $result = $this->approvalRepo->findAllPendingQueue($offset, $limit, $search, $branchIds, $sortBy, $sortDir, $roleId, $stepName, $productId, $agentId);
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
                $result = $this->approvalRepo->findPendingForRole($roleId, 0, 1000, $search, $branchIds);
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
                'branch_name'      => $loanData['branch_name'] ?? null,
                'product_name'     => $loanData['product_name'] ?? null,
                'product_id'       => $loanData['product_id'] ?? null,
                'agent_name'       => $loanData['agent_name'] ?? null,
                'agent_id'         => $loanData['agent_id'] ?? null,
                'amount_requested' => $loanData['amount_requested'] ?? null,
                'loan_status'      => $loanData['status'] ?? null,
                'loan_type'        => $loanData['loan_type'] ?? null,
                'previous_loan_id' => $loanData['previous_loan_id'] ?? null,
                'top_up_balance'   => $loanData['top_up_balance'] ?? null,
                'top_up_balance_underwriter' => $loanData['top_up_balance_underwriter'] ?? null,
                // Alias for display: 'current_step' reads as the step
                // the loan is currently at, which is this approval's
                // step_name for sequential mode or the earliest pending
                // step name for parallel mode.
                'current_step'     => $a->getStep()->getName(),
                // Role slug on the CURRENT approval step. The admin
                // approval UI keys off this to decide whether to show
                // underwriter-only fields (the top-up balance override)
                // in the decision modal.
                'current_step_role_slug' => $a->getStep()->getRole()->getSlug(),
                'current_step_role'      => $a->getStep()->getRole()->getName(),
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

    /**
     * Evaluate the loan's overall approval status after a step decision.
     *
     * $user may be null in the SLA-breach auto-approval path — no human
     * triggered the decision. We attribute auto-verified docs to
     * 'system:sla_breach' so the audit trail is clear rather than
     * falsely claiming a real user signed off.
     */
    private function evaluateOverallStatus(Loan $loan, ApprovalWorkflow $workflow, ?User $user = null): array
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

                // Auto-verify attached documents. An approved loan means
                // the reviewers have looked at the supporting docs and
                // found them acceptable — we shouldn't leave the docs
                // showing 'Pending' in the UI. Flip every PENDING doc
                // on this loan to VERIFIED, attributing the verification
                // to the user who triggered the final approval.
                //
                // Closes clarification item from commit V.6: documents
                // were showing 'Pending' status even on approved loans
                // because no one ever explicitly verified them.
                //
                // Safe if the loan has no documents (no-op).
                // Does not override already-VERIFIED or REJECTED docs
                // — those are terminal states set by explicit action.
                $docRepo = $this->em->getRepository(\App\Domain\Entity\Document::class);
                $pendingDocs = $docRepo->findBy([
                    'loanId' => $loan->getId(),
                    'status' => \App\Domain\Enum\DocumentStatus::PENDING,
                ]);
                // Attribute the auto-verification to the approving user
                // when we have one; fall back to a synthetic marker on
                // the SLA-breach path so the audit trail is honest.
                $verifiedBy = $user !== null ? $user->getId() : 'system:sla_breach';
                foreach ($pendingDocs as $doc) {
                    $doc->verify($verifiedBy);
                }

                return ['loan_status' => LoanStatus::APPROVED->value, 'approval_status' => 'approved', 'message' => 'Loan has been approved'];
            }
        }

        return ['loan_status' => LoanStatus::UNDER_REVIEW->value, 'approval_status' => 'pending', 'message' => 'Approval in progress'];
    }
}
