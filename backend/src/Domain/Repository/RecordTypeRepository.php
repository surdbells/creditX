<?php
declare(strict_types=1);
namespace App\Domain\Repository;

use App\Domain\Entity\RecordType;

class RecordTypeRepository extends BaseRepository
{
    protected function getEntityClass(): string { return RecordType::class; }

    public function findByCode(string $code): ?RecordType
    {
        return $this->findOneBy(['code' => strtoupper($code)]);
    }

    public function codeExists(string $code, ?string $excludeId = null): bool
    {
        $qb = $this->em->createQueryBuilder()->select('COUNT(r.id)')->from(RecordType::class, 'r')
            ->where('UPPER(r.code) = :code')->setParameter('code', strtoupper($code));
        if ($excludeId) $qb->andWhere('r.id != :ex')->setParameter('ex', $excludeId);
        return (int) $qb->getQuery()->getSingleScalarResult() > 0;
    }

    /** @return array{items: RecordType[], total: int} */
    public function paginated(int $offset, int $limit, string $sortBy = 'createdAt', string $sortDir = 'DESC', ?string $search = null, ?bool $isActive = null): array
    {
        $qb = $this->em->createQueryBuilder()->select('r')->from(RecordType::class, 'r');
        if ($isActive !== null) $qb->andWhere('r.isActive = :active')->setParameter('active', $isActive);
        return $this->paginatedQuery($qb, 'r', $offset, $limit, $sortBy, $sortDir, $search, ['name', 'code', 'description']);
    }

    /** @return RecordType[] */
    public function findActive(): array { return $this->findBy(['isActive' => true], ['name' => 'ASC']); }
}
