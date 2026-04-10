<?php
declare(strict_types=1);
namespace App\Domain\Repository;

use App\Domain\Entity\LoanProduct;

class LoanProductRepository extends BaseRepository
{
    protected function getEntityClass(): string { return LoanProduct::class; }

    public function findByCode(string $code): ?LoanProduct { return $this->findOneBy(['code' => strtoupper($code)]); }

    public function codeExists(string $code, ?string $excludeId = null): bool
    {
        $qb = $this->em->createQueryBuilder()->select('COUNT(p.id)')->from(LoanProduct::class, 'p')
            ->where('UPPER(p.code) = :code')->setParameter('code', strtoupper($code));
        if ($excludeId) $qb->andWhere('p.id != :ex')->setParameter('ex', $excludeId);
        return (int) $qb->getQuery()->getSingleScalarResult() > 0;
    }

    /** @return array{items: LoanProduct[], total: int} */
    public function paginated(int $offset, int $limit, string $sortBy = 'createdAt', string $sortDir = 'DESC', ?string $search = null, ?bool $isActive = null): array
    {
        $qb = $this->em->createQueryBuilder()->select('p')->from(LoanProduct::class, 'p');
        if ($isActive !== null) $qb->andWhere('p.isActive = :active')->setParameter('active', $isActive);
        return $this->paginatedQuery($qb, 'p', $offset, $limit, $sortBy, $sortDir, $search, ['name', 'code', 'description']);
    }

    /** @return LoanProduct[] */
    public function findActive(): array { return $this->findBy(['isActive' => true], ['name' => 'ASC']); }
}
