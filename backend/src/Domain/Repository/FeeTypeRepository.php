<?php
declare(strict_types=1);
namespace App\Domain\Repository;

use App\Domain\Entity\FeeType;

class FeeTypeRepository extends BaseRepository
{
    protected function getEntityClass(): string { return FeeType::class; }

    public function findByCode(string $code): ?FeeType { return $this->findOneBy(['code' => strtoupper($code)]); }

    public function codeExists(string $code, ?string $excludeId = null): bool
    {
        $qb = $this->em->createQueryBuilder()->select('COUNT(f.id)')->from(FeeType::class, 'f')
            ->where('UPPER(f.code) = :code')->setParameter('code', strtoupper($code));
        if ($excludeId) $qb->andWhere('f.id != :ex')->setParameter('ex', $excludeId);
        return (int) $qb->getQuery()->getSingleScalarResult() > 0;
    }

    /** @return array{items: FeeType[], total: int} */
    public function paginated(int $offset, int $limit, string $sortBy = 'createdAt', string $sortDir = 'DESC', ?string $search = null, ?bool $isActive = null): array
    {
        $qb = $this->em->createQueryBuilder()->select('f')->from(FeeType::class, 'f');
        if ($isActive !== null) $qb->andWhere('f.isActive = :active')->setParameter('active', $isActive);
        return $this->paginatedQuery($qb, 'f', $offset, $limit, $sortBy, $sortDir, $search, ['name', 'code', 'description']);
    }

    /** @return FeeType[] */
    public function findActive(): array { return $this->findBy(['isActive' => true], ['name' => 'ASC']); }
}
