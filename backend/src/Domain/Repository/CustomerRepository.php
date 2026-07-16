<?php
declare(strict_types=1);
namespace App\Domain\Repository;

use App\Domain\Entity\Customer;

class CustomerRepository extends BaseRepository
{
    protected function getEntityClass(): string { return Customer::class; }

    /**
     * Exact Staff ID lookup, insensitive to case and surrounding whitespace —
     * matching GovernmentRecordRepository::findByStaffId. Both must normalise
     * the same way: this method backs the duplicate-customer guard, so if it
     * were case-sensitive a 'pf0044542' capture would miss an existing
     * 'PF0044542' customer and create a duplicate.
     */
    public function findByStaffId(string $staffId): ?Customer
    {
        return $this->em->createQueryBuilder()->select('c')->from(Customer::class, 'c')
            ->where('UPPER(TRIM(c.staffId)) = :sid')
            ->setParameter('sid', strtoupper(trim($staffId)))
            ->setMaxResults(1)
            ->getQuery()->getOneOrNullResult();
    }

    public function findByBvn(string $bvn): ?Customer
    {
        return $this->findOneBy(['bvn' => $bvn]);
    }

    /**
     * Look up a customer by email. Email is stored lower-cased/trimmed by the
     * entity setter, so callers must normalise before searching — the portal
     * actions pass already-validated (lower-cased) emails.
     */
    public function findByEmail(string $email): ?Customer
    {
        return $this->findOneBy(['email' => strtolower(trim($email))]);
    }

    /** Normalised the same way as findByStaffId so the create-time guard agrees with it. */
    public function staffIdExists(string $staffId, ?string $excludeId = null): bool
    {
        $qb = $this->em->createQueryBuilder()->select('COUNT(c.id)')->from(Customer::class, 'c')
            ->where('UPPER(TRIM(c.staffId)) = :sid')
            ->setParameter('sid', strtoupper(trim($staffId)));
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
