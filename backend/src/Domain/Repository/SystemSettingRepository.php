<?php

declare(strict_types=1);

namespace App\Domain\Repository;

use App\Domain\Entity\SystemSetting;

class SystemSettingRepository extends BaseRepository
{
    protected function getEntityClass(): string
    {
        return SystemSetting::class;
    }

    public function findByKey(string $key): ?SystemSetting
    {
        return $this->findOneBy(['key' => $key]);
    }

    public function keyExists(string $key, ?string $excludeId = null): bool
    {
        $qb = $this->em->createQueryBuilder()
            ->select('COUNT(s.id)')
            ->from(SystemSetting::class, 's')
            ->where('s.key = :key')
            ->setParameter('key', $key);

        if ($excludeId !== null) {
            $qb->andWhere('s.id != :excludeId')
               ->setParameter('excludeId', $excludeId);
        }

        return (int) $qb->getQuery()->getSingleScalarResult() > 0;
    }

    /**
     * @return SystemSetting[]
     */
    public function findByCategory(string $category): array
    {
        return $this->findBy(['category' => $category], ['key' => 'ASC']);
    }

    /**
     * @return array{items: SystemSetting[], total: int}
     */
    public function paginated(
        int $offset,
        int $limit,
        string $sortBy = 'key',
        string $sortDir = 'ASC',
        ?string $search = null,
        ?string $category = null,
    ): array {
        $qb = $this->em->createQueryBuilder()
            ->select('s')
            ->from(SystemSetting::class, 's');

        if ($category !== null) {
            $qb->andWhere('s.category = :category')
               ->setParameter('category', $category);
        }

        return $this->paginatedQuery(
            $qb, 's', $offset, $limit, $sortBy, $sortDir,
            $search, ['key', 'description']
        );
    }
}
