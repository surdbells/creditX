<?php

declare(strict_types=1);

namespace App\Domain\Repository;

use App\Domain\Entity\Role;

class RoleRepository extends BaseRepository
{
    protected function getEntityClass(): string
    {
        return Role::class;
    }

    public function findBySlug(string $slug): ?Role
    {
        return $this->findOneBy(['slug' => strtolower($slug)]);
    }

    public function slugExists(string $slug, ?string $excludeId = null): bool
    {
        $qb = $this->em->createQueryBuilder()
            ->select('COUNT(r.id)')
            ->from(Role::class, 'r')
            ->where('r.slug = :slug')
            ->setParameter('slug', strtolower($slug));

        if ($excludeId !== null) {
            $qb->andWhere('r.id != :excludeId')
               ->setParameter('excludeId', $excludeId);
        }

        return (int) $qb->getQuery()->getSingleScalarResult() > 0;
    }

    /**
     * @return array{items: Role[], total: int}
     */
    public function paginated(
        int $offset,
        int $limit,
        string $sortBy = 'createdAt',
        string $sortDir = 'DESC',
        ?string $search = null,
    ): array {
        $qb = $this->em->createQueryBuilder()
            ->select('r')
            ->from(Role::class, 'r');

        return $this->paginatedQuery(
            $qb, 'r', $offset, $limit, $sortBy, $sortDir,
            $search, ['name', 'slug', 'description']
        );
    }

    /**
     * @return Role[]
     */
    public function findActive(): array
    {
        return $this->findBy(['isActive' => true], ['name' => 'ASC']);
    }
}
