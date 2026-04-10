<?php
declare(strict_types=1);
namespace App\Domain\Repository;

use App\Domain\Entity\Customer;

class CustomerRepository extends BaseRepository
{
    protected function getEntityClass(): string { return Customer::class; }

    public function findByStaffId(string $staffId): ?Customer
    {
        return $this->findOneBy(['staffId' => $staffId]);
    }

    public function findByBvn(string $bvn): ?Customer
    {
        return $this->findOneBy(['bvn' => $bvn]);
    }

    public function staffIdExists(string $staffId, ?string $excludeId = null): bool
    {
        $qb = $this->em->createQueryBuilder()->select('COUNT(c.id)')->from(Customer::class, 'c')
            ->where('c.staffId = :sid')->setParameter('sid', $staffId);
        if ($excludeId) $qb->andWhere('c.id != :ex')->setParameter('ex', $excludeId);
        return (int) $qb->getQuery()->getSingleScalarResult() > 0;
    }

    /** @return array{items: Customer[], total: int} */
    public function paginated(int $offset, int $limit, string $sortBy = 'createdAt', string $sortDir = 'DESC', ?string $search = null): array
    {
        $qb = $this->em->createQueryBuilder()->select('c')->from(Customer::class, 'c')
            ->where('c.deletedAt IS NULL');
        return $this->paginatedQuery($qb, 'c', $offset, $limit, $sortBy, $sortDir, $search, ['fullName', 'staffId', 'phone', 'bvn', 'email']);
    }
}
