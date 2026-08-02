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
     * Loans awaiting a decision for a customer — draft/captured/submitted/
     * under-review/approved (approved = decided but not yet disbursed). While
     * one exists, no agent may capture another loan for the customer. A
     * disbursed loan is NOT here (a new application against it becomes a
     * top-up); rejected/cancelled/closed/written-off are not here either
     * (agents may resubmit).
     * @return Loan[]
     */
    /**
     * Loans that are disbursed and still owing for a customer — disbursed,
     * active, overdue, or restructured. A new application against one of these
     * either becomes a top-up (if the product allows it) or is refused.
     * @return Loan[]
     */
    public function findOwingByCustomer(string $customerId): array
    {
        $owing = [
            LoanStatus::DISBURSED->value, LoanStatus::ACTIVE->value,
            LoanStatus::OVERDUE->value, LoanStatus::RESTRUCTURED->value,
        ];
        return $this->em->createQueryBuilder()->select('l')->from(Loan::class, 'l')
            ->where('l.customer = :cid')->andWhere('l.status IN (:owing)')
            ->setParameter('cid', $customerId)->setParameter('owing', $owing)
            ->getQuery()->getResult();
    }

    public function findPendingDecisionByCustomer(string $customerId): array
    {
        $pending = [
            LoanStatus::DRAFT->value, LoanStatus::CAPTURED->value,
            LoanStatus::SUBMITTED->value, LoanStatus::UNDER_REVIEW->value,
            LoanStatus::APPROVED->value,
        ];
        return $this->em->createQueryBuilder()->select('l')->from(Loan::class, 'l')
            ->where('l.customer = :cid')->andWhere('l.status IN (:pending)')
            ->setParameter('cid', $customerId)->setParameter('pending', $pending)
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
            ->where('UPPER(TRIM(c.staffId)) = :sid')->andWhere('l.status = :status')
            ->setParameter('sid', strtoupper(trim($staffId)))->setParameter('status', LoanStatus::DISBURSED->value)
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
            ->where('UPPER(TRIM(c.staffId)) = :sid')->andWhere('l.status IN (:statuses)')
            ->setParameter('sid', strtoupper(trim($staffId)))->setParameter('statuses', $inProgress);
        if ($excludeLoanId) $qb->andWhere('l.id != :ex')->setParameter('ex', $excludeLoanId);
        return (int) $qb->getQuery()->getSingleScalarResult() > 0;
    }

    /**
     * @param string|string[]|null $status One status, or a set of them. A set is
     *        needed because a single UI filter often spans several statuses —
     *        "Active" covers disbursed/active/overdue, "In review" covers
     *        submitted/under_review — and matching only one hid those loans.
     * @param string|null $dateFrom Y-m-d, filters on creation date (inclusive).
     * @param string|null $dateTo   Y-m-d, inclusive of the whole day.
     * @return array{items: Loan[], total: int}
     */
    public function paginated(
        int $offset, int $limit, string $sortBy = 'createdAt', string $sortDir = 'DESC',
        ?string $search = null, string|array|null $status = null, ?string $productId = null,
        ?string $branchId = null, ?string $agentId = null, ?string $customerId = null,
        ?string $dateFrom = null, ?string $dateTo = null,
    ): array {
        $qb = $this->em->createQueryBuilder()->select('l')->from(Loan::class, 'l')
            ->innerJoin('l.customer', 'c');
        if (is_array($status)) {
            if ($status !== []) $qb->andWhere('l.status IN (:statuses)')->setParameter('statuses', $status);
        } elseif ($status) {
            $qb->andWhere('l.status = :status')->setParameter('status', $status);
        }
        if ($productId) $qb->andWhere('l.product = :pid')->setParameter('pid', $productId);
        if ($branchId) $qb->andWhere('l.branch = :bid')->setParameter('bid', $branchId);
        if ($agentId) $qb->andWhere('l.agent = :aid')->setParameter('aid', $agentId);
        if ($customerId) $qb->andWhere('l.customer = :cid')->setParameter('cid', $customerId);
        // createdAt is a timestamp, so the end date is taken to the last second
        // of that day — a bare date would drop everything captured after
        // midnight on the final day of the range.
        if ($dateFrom) $qb->andWhere('l.createdAt >= :dfrom')
            ->setParameter('dfrom', new \DateTimeImmutable($dateFrom . ' 00:00:00'));
        if ($dateTo) $qb->andWhere('l.createdAt <= :dto')
            ->setParameter('dto', new \DateTimeImmutable($dateTo . ' 23:59:59'));

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
