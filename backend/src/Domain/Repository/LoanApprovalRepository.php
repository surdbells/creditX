<?php
declare(strict_types=1);
namespace App\Domain\Repository;

use App\Domain\Entity\LoanApproval;
use App\Domain\Enum\ApprovalStatus;
use App\Domain\Enum\LoanStatus;

class LoanApprovalRepository extends BaseRepository
{
    protected function getEntityClass(): string { return LoanApproval::class; }

    /** @return LoanApproval[] */
    public function findByLoan(string $loanId): array
    {
        return $this->em->createQueryBuilder()->select('a')->from(LoanApproval::class, 'a')
            ->innerJoin('a.step', 's')
            ->where('a.loan = :lid')->setParameter('lid', $loanId)
            ->orderBy('s.stepOrder', 'ASC')
            ->getQuery()->getResult();
    }

    /**
     * Find the next pending approval for a loan (sequential mode).
     */
    public function findNextPending(string $loanId): ?LoanApproval
    {
        return $this->em->createQueryBuilder()->select('a')->from(LoanApproval::class, 'a')
            ->innerJoin('a.step', 's')
            ->where('a.loan = :lid')->andWhere('a.status = :status')
            ->setParameter('lid', $loanId)->setParameter('status', ApprovalStatus::PENDING->value)
            ->orderBy('s.stepOrder', 'ASC')
            ->setMaxResults(1)
            ->getQuery()->getOneOrNullResult();
    }

    /**
     * Find all pending approvals for a loan (parallel mode).
     * @return LoanApproval[]
     */
    public function findAllPending(string $loanId): array
    {
        return $this->findBy(['loan' => $loanId, 'status' => ApprovalStatus::PENDING]);
    }

    /**
     * Get pending approvals for a specific role (approval queue).
     *
     * @param string[]|null $branchIds  Optional branch scope. Null means no
     *                                  scope (typically admin/super_admin —
     *                                  though the current caller never takes
     *                                  this path since the global-visibility
     *                                  branch goes through findAllPendingQueue
     *                                  instead). Empty array means the user
     *                                  has no assigned branches and should
     *                                  see nothing. Non-empty array restricts
     *                                  to loans whose branch_id is in the set.
     * @return array{items: LoanApproval[], total: int}
     */
    public function findPendingForRole(
        string $roleId,
        int $offset,
        int $limit,
        ?string $search = null,
        ?array $branchIds = null
    ): array {
        $qb = $this->em->createQueryBuilder()->select('a')->from(LoanApproval::class, 'a')
            ->innerJoin('a.step', 's')
            ->innerJoin('a.loan', 'l')
            ->innerJoin('l.customer', 'c')
            ->leftJoin('l.branch', 'b')
            ->leftJoin('l.agent', 'ag')
            ->where('s.role = :roleId')->andWhere('a.status = :status')
            // See findAllPendingQueue for the rationale — only active
            // pending steps should surface in the queue. Role-scoped
            // approvers also need this to avoid seeing future-step
            // approvals on their queue before earlier steps complete.
            ->andWhere('a.slaStartedAt IS NOT NULL')
            // Only surface approvals whose loan is still under review — once a
            // mandatory step rejects (or the loan is otherwise decided), its
            // remaining pending steps must drop out of every role's queue.
            ->andWhere('l.status = :loanUnderReview')
            ->setParameter('roleId', $roleId)->setParameter('status', ApprovalStatus::PENDING->value)
            ->setParameter('loanUnderReview', LoanStatus::UNDER_REVIEW->value);

        if ($search && $search !== '') {
            $qb->andWhere($qb->expr()->orX(
                $qb->expr()->like('LOWER(l.applicationId)', ':search'),
                $qb->expr()->like('LOWER(c.fullName)', ':search'),
                $qb->expr()->like('LOWER(c.staffId)', ':search'),
                $qb->expr()->like('LOWER(b.name)', ':search'),
                $qb->expr()->like('LOWER(ag.fullName)', ':search'),
            ))->setParameter('search', '%' . strtolower($search) . '%');
        }

        if ($branchIds !== null) {
            if (empty($branchIds)) {
                $qb->andWhere('1 = 0');
            } else {
                $qb->andWhere('l.branch IN (:branchIds)')
                   ->setParameter('branchIds', $branchIds);
            }
        }

        $countQb = clone $qb;
        $countQb->select('COUNT(a.id)')->resetDQLPart('orderBy');
        $total = (int) $countQb->getQuery()->getSingleScalarResult();

        $qb->orderBy('a.createdAt', 'ASC')->setFirstResult($offset)->setMaxResults($limit);
        return ['items' => $qb->getQuery()->getResult(), 'total' => $total];
    }

    /**
     * Find ALL pending approvals regardless of step/role assignment.
     * Used by the approval queue when the caller has a global-visibility
     * permission (e.g. Super Admin) — they need to see every pending
     * approval across all workflows, not just ones routed to their roles.
     *
     * Distinct from findAllPending(loanId) above which filters by a single
     * loan. This method is the queue-wide counterpart.
     *
     * @param string[]|null $branchIds  See findPendingForRole for semantics.
     * @return array{items: LoanApproval[], total: int}
     */
    public function findAllPendingQueue(
        int $offset,
        int $limit,
        ?string $search = null,
        ?array $branchIds = null,
        string $sortBy = 'created_at',
        string $sortDir = 'DESC',
        ?string $roleId = null,
        ?string $stepName = null,
        ?string $productId = null,
        ?string $agentId = null
    ): array {
        $qb = $this->em->createQueryBuilder()->select('a')->from(LoanApproval::class, 'a')
            ->innerJoin('a.step', 's')
            ->leftJoin('s.role', 'sr')
            ->innerJoin('a.loan', 'l')
            ->innerJoin('l.customer', 'c')
            ->leftJoin('l.branch', 'b')
            ->leftJoin('l.product', 'p')
            ->leftJoin('l.agent', 'ag')
            ->where('a.status = :status')
            // Only include 'active' pending approvals — ones where the SLA
            // clock has started. For sequential workflows this is the
            // current step the approver must act on (only one per loan at
            // a time). For parallel workflows, ALL pending steps have the
            // clock running, so all legitimately appear in the queue (one
            // row per decision needed).
            //
            // Without this filter, sequential workflows with N steps
            // produced N queue rows per loan — all N were PENDING from
            // the moment the loan was submitted, but only step #1 was
            // actually ready for decision. The duplicate rows were the
            // bug the user reported in this session.
            ->andWhere('a.slaStartedAt IS NOT NULL')
            // Only surface approvals whose loan is still under review — once a
            // mandatory step rejects (or the loan is otherwise decided), its
            // remaining pending steps must drop out of the queue.
            ->andWhere('l.status = :loanUnderReview')
            ->setParameter('status', ApprovalStatus::PENDING->value)
            ->setParameter('loanUnderReview', LoanStatus::UNDER_REVIEW->value);

        if ($search && $search !== '') {
            $qb->andWhere($qb->expr()->orX(
                $qb->expr()->like('LOWER(l.applicationId)', ':search'),
                $qb->expr()->like('LOWER(c.fullName)', ':search'),
                $qb->expr()->like('LOWER(c.staffId)', ':search'),
                $qb->expr()->like('LOWER(b.name)', ':search'),
                // DSA / agent name — lets reviewers find a loan by who captured it.
                $qb->expr()->like('LOWER(ag.fullName)', ':search'),
            ))->setParameter('search', '%' . strtolower($search) . '%');
        }

        if ($branchIds !== null) {
            if (empty($branchIds)) {
                $qb->andWhere('1 = 0');
            } else {
                $qb->andWhere('l.branch IN (:branchIds)')
                   ->setParameter('branchIds', $branchIds);
            }
        }

        // Admin/super-admin queue filters — narrow to a specific step role
        // and/or step name. Step is matched by name (not id) because the same
        // logical step (e.g. "Operations Review") can exist across multiple
        // workflows with distinct ids; filtering by name catches them all.
        if ($roleId !== null && $roleId !== '') {
            $qb->andWhere('sr.id = :fRoleId')->setParameter('fRoleId', $roleId);
        }
        if ($stepName !== null && $stepName !== '') {
            $qb->andWhere('s.name = :fStepName')->setParameter('fStepName', $stepName);
        }
        // Product and agent (DSA) filters.
        if ($productId !== null && $productId !== '') {
            $qb->andWhere('l.product = :fProductId')->setParameter('fProductId', $productId);
        }
        if ($agentId !== null && $agentId !== '') {
            $qb->andWhere('l.agent = :fAgentId')->setParameter('fAgentId', $agentId);
        }

        $countQb = clone $qb;
        $countQb->select('COUNT(a.id)')->resetDQLPart('orderBy');
        $total = (int) $countQb->getQuery()->getSingleScalarResult();

        // Sort — whitelist Step and Role (the only user-sortable queue
        // columns), which honor the chosen direction. The DEFAULT order is
        // FIFO: oldest submission first, so loans are worked first-come,
        // first-served. createdAt on the approval row is the loan's
        // submission time (all step rows are created together at initiate).
        // The "Submitted" column is not user-sortable, so this default
        // governs the natural queue order — previously it was DESC, which
        // surfaced the newest loans at the top and broke FIFO. This matches
        // the role-scoped queue (findPendingForRole), which is already ASC.
        // NB: getPaginationParams() camelCases sort_by, so the frontend's
        // 'current_step' / 'current_step_role' arrive here as 'currentStep' /
        // 'currentStepRole'. Match both forms so the Step/Role column sorts
        // actually take effect (they previously fell through to the default).
        $dir = strtoupper($sortDir) === 'ASC' ? 'ASC' : 'DESC';
        [$orderCol, $orderDir] = match ($sortBy) {
            'current_step', 'currentStep'                                    => ['s.name', $dir],
            'current_step_role_slug', 'current_step_role', 'role',
            'currentStepRoleSlug', 'currentStepRole'                         => ['sr.name', $dir],
            default                                                          => ['a.createdAt', 'ASC'],
        };
        $qb->orderBy($orderCol, $orderDir)->addOrderBy('a.createdAt', 'ASC')
           ->setFirstResult($offset)->setMaxResults($limit);
        return ['items' => $qb->getQuery()->getResult(), 'total' => $total];
    }

    /**
     * Find approvals nearing or past SLA.
     * @return LoanApproval[]
     */
    public function findSlaBreachCandidates(): array
    {
        return $this->em->createQueryBuilder()->select('a')->from(LoanApproval::class, 'a')
            ->innerJoin('a.step', 's')
            ->where('a.status = :status')
            ->andWhere('a.slaStartedAt IS NOT NULL')
            ->andWhere('s.slaHours IS NOT NULL')
            ->setParameter('status', ApprovalStatus::PENDING->value)
            ->getQuery()->getResult();
    }
}
