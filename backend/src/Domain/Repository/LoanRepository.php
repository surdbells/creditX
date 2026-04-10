<?php
declare(strict_types=1);
namespace App\Domain\Repository;

use App\Domain\Entity\Loan;
use App\Domain\Enum\LoanStatus;

class LoanRepository extends BaseRepository
{
    protected function getEntityClass(): string { return Loan::class; }

    public function findByApplicationId(string $appId): ?Loan { return $this->findOneBy(['applicationId' => $appId]); }

    /**
     * Check for active loans (non-closed/cancelled/written-off) for a customer.
     * @return Loan[]
     */
    public function findActiveByCustomer(string $customerId): array
    {
        $closedStatuses = [LoanStatus::CLOSED->value, LoanStatus::CANCELLED->value, LoanStatus::WRITTEN_OFF->value];
        return $this->em->createQueryBuilder()->select('l')->from(Loan::class, 'l')
            ->where('l.customer = :cid')->andWhere('l.status NOT IN (:closed)')
            ->setParameter('cid', $customerId)->setParameter('closed', $closedStatuses)
            ->getQuery()->getResult();
    }

    /**
     * Find disbursed loans for a customer (for top-up detection).
     * @return Loan[]
     */
    public function findDisbursedByStaffId(string $staffId): array
    {
        return $this->em->createQueryBuilder()->select('l')->from(Loan::class, 'l')
            ->innerJoin('l.customer', 'c')
            ->where('c.staffId = :sid')->andWhere('l.status = :status')
            ->setParameter('sid', $staffId)->setParameter('status', LoanStatus::DISBURSED->value)
            ->getQuery()->getResult();
    }

    /**
     * Check for pending/submitted/approved/captured loans for a staff ID.
     */
    public function hasInProgressLoanForStaffId(string $staffId, ?string $excludeLoanId = null): bool
    {
        $inProgress = [LoanStatus::DRAFT->value, LoanStatus::CAPTURED->value, LoanStatus::SUBMITTED->value, LoanStatus::UNDER_REVIEW->value, LoanStatus::APPROVED->value];
        $qb = $this->em->createQueryBuilder()->select('COUNT(l.id)')->from(Loan::class, 'l')
            ->innerJoin('l.customer', 'c')
            ->where('c.staffId = :sid')->andWhere('l.status IN (:statuses)')
            ->setParameter('sid', $staffId)->setParameter('statuses', $inProgress);
        if ($excludeLoanId) $qb->andWhere('l.id != :ex')->setParameter('ex', $excludeLoanId);
        return (int) $qb->getQuery()->getSingleScalarResult() > 0;
    }

    /** @return array{items: Loan[], total: int} */
    public function paginated(
        int $offset, int $limit, string $sortBy = 'createdAt', string $sortDir = 'DESC',
        ?string $search = null, ?string $status = null, ?string $productId = null,
        ?string $branchId = null, ?string $agentId = null,
    ): array {
        $qb = $this->em->createQueryBuilder()->select('l')->from(Loan::class, 'l')
            ->innerJoin('l.customer', 'c');
        if ($status) $qb->andWhere('l.status = :status')->setParameter('status', $status);
        if ($productId) $qb->andWhere('l.product = :pid')->setParameter('pid', $productId);
        if ($branchId) $qb->andWhere('l.branch = :bid')->setParameter('bid', $branchId);
        if ($agentId) $qb->andWhere('l.agent = :aid')->setParameter('aid', $agentId);

        // Search across loan and customer fields
        if ($search && $search !== '') {
            $qb->andWhere($qb->expr()->orX(
                $qb->expr()->like('LOWER(l.applicationId)', ':search'),
                $qb->expr()->like('LOWER(c.fullName)', ':search'),
                $qb->expr()->like('LOWER(c.staffId)', ':search'),
            ))->setParameter('search', '%' . strtolower($search) . '%');
        }

        // Count
        $countQb = clone $qb;
        $countQb->select('COUNT(l.id)')->resetDQLPart('orderBy');
        $total = (int) $countQb->getQuery()->getSingleScalarResult();

        $qb->orderBy("l.{$sortBy}", $sortDir)->setFirstResult($offset)->setMaxResults($limit);
        return ['items' => $qb->getQuery()->getResult(), 'total' => $total];
    }
}
