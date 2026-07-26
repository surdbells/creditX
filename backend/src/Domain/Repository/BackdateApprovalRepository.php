<?php
declare(strict_types=1);
namespace App\Domain\Repository;

use App\Domain\Entity\BackdateApproval;

class BackdateApprovalRepository extends BaseRepository
{
    protected function getEntityClass(): string { return BackdateApproval::class; }

    /**
     * A usable approval for this user and date, if one exists. Oldest first, so
     * approvals are consumed in the order they were granted.
     */
    public function findUsable(string $userId, string $date): ?BackdateApproval
    {
        return $this->em->createQueryBuilder()->select('a')->from(BackdateApproval::class, 'a')
            ->where('a.requestedBy = :u')->setParameter('u', $userId)
            ->andWhere('a.businessDate = :d')->setParameter('d', new \DateTimeImmutable($date))
            ->andWhere('a.status = :s')->setParameter('s', BackdateApproval::STATUS_APPROVED)
            ->andWhere('a.expiresAt IS NULL OR a.expiresAt > :now')->setParameter('now', new \DateTimeImmutable())
            ->orderBy('a.createdAt', 'ASC')->setMaxResults(1)
            ->getQuery()->getOneOrNullResult();
    }

    /** Has this user already got an undecided request for the date? */
    public function findPending(string $userId, string $date): ?BackdateApproval
    {
        return $this->em->createQueryBuilder()->select('a')->from(BackdateApproval::class, 'a')
            ->where('a.requestedBy = :u')->setParameter('u', $userId)
            ->andWhere('a.businessDate = :d')->setParameter('d', new \DateTimeImmutable($date))
            ->andWhere('a.status = :s')->setParameter('s', BackdateApproval::STATUS_PENDING)
            ->setMaxResults(1)
            ->getQuery()->getOneOrNullResult();
    }

    /**
     * @param array{status?:?string, requested_by?:?string} $filters
     * @return array{items: BackdateApproval[], total: int}
     */
    public function findPaginated(int $offset, int $limit, array $filters): array
    {
        $qb = $this->em->createQueryBuilder()->select('a')->from(BackdateApproval::class, 'a');

        if (!empty($filters['status'])) {
            $qb->andWhere('a.status = :s')->setParameter('s', $filters['status']);
        }
        if (!empty($filters['requested_by'])) {
            $qb->andWhere('a.requestedBy = :u')->setParameter('u', $filters['requested_by']);
        }

        $countQb = clone $qb;
        $total = (int) $countQb->select('COUNT(a.id)')->getQuery()->getSingleScalarResult();

        $qb->orderBy('a.createdAt', 'DESC')->setFirstResult($offset)->setMaxResults($limit);
        return ['items' => $qb->getQuery()->getResult(), 'total' => $total];
    }
}
