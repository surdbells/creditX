<?php
declare(strict_types=1);
namespace App\Domain\Repository;

use App\Domain\Entity\CreditCheck;

class CreditCheckRepository extends BaseRepository
{
    protected function getEntityClass(): string { return CreditCheck::class; }

    /** Most recent check for a loan (used by the approval step + loan detail). */
    public function findLatestForLoan(string $loanId): ?CreditCheck
    {
        return $this->em->createQueryBuilder()->select('c')->from(CreditCheck::class, 'c')
            ->where('c.loan = :l')->setParameter('l', $loanId)
            ->orderBy('c.createdAt', 'DESC')->setMaxResults(1)
            ->getQuery()->getOneOrNullResult();
    }

    /** @return array{items: CreditCheck[], total: int} */
    public function findPaginated(int $offset, int $limit, ?string $search = null, ?string $status = null): array
    {
        $qb = $this->em->createQueryBuilder()->select('c')->from(CreditCheck::class, 'c')
            ->leftJoin('c.customer', 'cu')
            ->leftJoin('c.loan', 'l');

        if ($status !== null && $status !== '') {
            $qb->andWhere('c.status = :status')->setParameter('status', $status);
        }
        if ($search !== null && $search !== '') {
            $qb->andWhere($qb->expr()->orX(
                $qb->expr()->like('LOWER(c.identifier)', ':q'),
                $qb->expr()->like('LOWER(cu.fullName)', ':q'),
                $qb->expr()->like('LOWER(l.applicationId)', ':q'),
            ))->setParameter('q', '%' . strtolower($search) . '%');
        }

        $countQb = clone $qb;
        $total = (int) $countQb->select('COUNT(c.id)')->getQuery()->getSingleScalarResult();

        $qb->orderBy('c.createdAt', 'DESC')->setFirstResult($offset)->setMaxResults($limit);
        return ['items' => $qb->getQuery()->getResult(), 'total' => $total];
    }
}
