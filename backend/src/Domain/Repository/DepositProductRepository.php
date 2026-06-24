<?php
declare(strict_types=1);
namespace App\Domain\Repository;

use App\Domain\Entity\DepositProduct;

class DepositProductRepository extends BaseRepository
{
    protected function getEntityClass(): string { return DepositProduct::class; }

    public function findByCode(string $code): ?DepositProduct
    {
        return $this->findOneBy(['code' => strtoupper($code)]);
    }

    public function codeExists(string $code, ?string $excludeId = null): bool
    {
        $qb = $this->em->createQueryBuilder()->select('COUNT(p.id)')->from(DepositProduct::class, 'p')
            ->where('UPPER(p.code) = :code')->setParameter('code', strtoupper($code));
        if ($excludeId) {
            $qb->andWhere('p.id != :ex')->setParameter('ex', $excludeId);
        }
        return (int) $qb->getQuery()->getSingleScalarResult() > 0;
    }

    /** @return DepositProduct[] */
    public function findActive(): array
    {
        return $this->findBy(['isActive' => true], ['name' => 'ASC']);
    }

    /** @return array{items: DepositProduct[], total: int} */
    public function paginated(int $offset, int $limit, string $sortBy = 'createdAt', string $sortDir = 'DESC', ?string $search = null): array
    {
        $qb = $this->em->createQueryBuilder()->select('p')->from(DepositProduct::class, 'p');
        return $this->paginatedQuery($qb, 'p', $offset, $limit, $sortBy, $sortDir, $search, ['name', 'code']);
    }
}
