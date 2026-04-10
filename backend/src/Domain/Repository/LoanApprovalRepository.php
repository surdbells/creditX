<?php
declare(strict_types=1);
namespace App\Domain\Repository;

use App\Domain\Entity\LoanApproval;
use App\Domain\Enum\ApprovalStatus;

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
     * @return array{items: LoanApproval[], total: int}
     */
    public function findPendingForRole(string $roleId, int $offset, int $limit, ?string $search = null): array
    {
        $qb = $this->em->createQueryBuilder()->select('a')->from(LoanApproval::class, 'a')
            ->innerJoin('a.step', 's')
            ->innerJoin('a.loan', 'l')
            ->innerJoin('l.customer', 'c')
            ->where('s.role = :roleId')->andWhere('a.status = :status')
            ->setParameter('roleId', $roleId)->setParameter('status', ApprovalStatus::PENDING->value);

        if ($search && $search !== '') {
            $qb->andWhere($qb->expr()->orX(
                $qb->expr()->like('LOWER(l.applicationId)', ':search'),
                $qb->expr()->like('LOWER(c.fullName)', ':search'),
            ))->setParameter('search', '%' . strtolower($search) . '%');
        }

        $countQb = clone $qb;
        $countQb->select('COUNT(a.id)')->resetDQLPart('orderBy');
        $total = (int) $countQb->getQuery()->getSingleScalarResult();

        $qb->orderBy('a.createdAt', 'ASC')->setFirstResult($offset)->setMaxResults($limit);
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
