<?php

declare(strict_types=1);

namespace App\Domain\Repository;

use App\Domain\Entity\Permission;

class PermissionRepository extends BaseRepository
{
    protected function getEntityClass(): string
    {
        return Permission::class;
    }

    public function findBySlug(string $slug): ?Permission
    {
        return $this->findOneBy(['slug' => $slug]);
    }

    /**
     * @param string[] $slugs
     * @return Permission[]
     */
    public function findBySlugs(array $slugs): array
    {
        if (empty($slugs)) {
            return [];
        }
        return $this->em->createQueryBuilder()
            ->select('p')
            ->from(Permission::class, 'p')
            ->where('p.slug IN (:slugs)')
            ->setParameter('slugs', $slugs)
            ->getQuery()
            ->getResult();
    }

    /**
     * @return Permission[]
     */
    public function findByModule(string $module): array
    {
        return $this->findBy(['module' => $module], ['name' => 'ASC']);
    }

    /**
     * @return array<string, Permission[]> Grouped by module
     */
    public function allGroupedByModule(): array
    {
        $permissions = $this->findBy([], ['module' => 'ASC', 'name' => 'ASC']);
        $grouped = [];
        foreach ($permissions as $p) {
            $grouped[$p->getModule()][] = $p;
        }
        return $grouped;
    }
}
