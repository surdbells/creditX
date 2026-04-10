<?php

declare(strict_types=1);

namespace App\Domain\Repository;

use App\Domain\Entity\Location;

class LocationRepository extends BaseRepository
{
    protected function getEntityClass(): string
    {
        return Location::class;
    }

    public function codeExists(string $code, ?string $excludeId = null): bool
    {
        $qb = $this->em->createQueryBuilder()
            ->select('COUNT(l.id)')
            ->from(Location::class, 'l')
            ->where('LOWER(l.code) = :code')
            ->setParameter('code', strtolower($code));

        if ($excludeId !== null) {
            $qb->andWhere('l.id != :excludeId')
               ->setParameter('excludeId', $excludeId);
        }

        return (int) $qb->getQuery()->getSingleScalarResult() > 0;
    }

    /**
     * @return array{items: Location[], total: int}
     */
    public function paginated(
        int $offset,
        int $limit,
        string $sortBy = 'createdAt',
        string $sortDir = 'DESC',
        ?string $search = null,
        ?string $type = null,
        ?bool $isActive = null,
    ): array {
        $qb = $this->em->createQueryBuilder()
            ->select('l')
            ->from(Location::class, 'l');

        if ($type !== null) {
            $qb->andWhere('l.type = :type')
               ->setParameter('type', $type);
        }

        if ($isActive !== null) {
            $qb->andWhere('l.isActive = :active')
               ->setParameter('active', $isActive);
        }

        return $this->paginatedQuery(
            $qb, 'l', $offset, $limit, $sortBy, $sortDir,
            $search, ['name', 'code', 'address', 'state']
        );
    }

    /**
     * @return Location[]
     */
    public function findActive(): array
    {
        return $this->findBy(['isActive' => true], ['name' => 'ASC']);
    }
}
