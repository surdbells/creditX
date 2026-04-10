<?php
declare(strict_types=1);
namespace App\Domain\Repository;

use App\Domain\Entity\Payment;

class PaymentRepository extends BaseRepository
{
    protected function getEntityClass(): string { return Payment::class; }

    public function findByReference(string $ref): ?Payment { return $this->findOneBy(['reference' => $ref]); }

    /** @return array{items: Payment[], total: int} */
    public function paginated(int $offset, int $limit, string $sortBy = 'createdAt', string $sortDir = 'DESC', ?string $search = null, ?string $loanId = null, ?string $customerId = null, ?string $channel = null, ?string $status = null): array
    {
        $qb = $this->em->createQueryBuilder()->select('p')->from(Payment::class, 'p')
            ->innerJoin('p.customer', 'c');
        if ($loanId) $qb->andWhere('p.loan = :lid')->setParameter('lid', $loanId);
        if ($customerId) $qb->andWhere('p.customer = :cid')->setParameter('cid', $customerId);
        if ($channel) $qb->andWhere('p.channel = :ch')->setParameter('ch', $channel);
        if ($status) $qb->andWhere('p.status = :st')->setParameter('st', $status);

        if ($search && $search !== '') {
            $qb->andWhere($qb->expr()->orX(
                $qb->expr()->like('LOWER(p.reference)', ':search'),
                $qb->expr()->like('LOWER(c.fullName)', ':search'),
                $qb->expr()->like('LOWER(c.staffId)', ':search'),
            ))->setParameter('search', '%' . strtolower($search) . '%');
        }

        $countQb = clone $qb;
        $countQb->select('COUNT(p.id)')->resetDQLPart('orderBy');
        $total = (int) $countQb->getQuery()->getSingleScalarResult();

        $qb->orderBy("p.{$sortBy}", $sortDir)->setFirstResult($offset)->setMaxResults($limit);
        return ['items' => $qb->getQuery()->getResult(), 'total' => $total];
    }
}
