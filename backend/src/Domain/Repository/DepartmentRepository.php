<?php
declare(strict_types=1);
namespace App\Domain\Repository;

use App\Domain\Entity\Department;

class DepartmentRepository extends BaseRepository
{
    protected function getEntityClass(): string { return Department::class; }

    public function paginated(int $offset, int $limit, string $sortBy = 'createdAt', string $sortDir = 'DESC', ?string $search = null): array
    {
        $qb = $this->em->createQueryBuilder()->select('d')->from(Department::class, 'd');
        return $this->paginatedQuery($qb, 'd', $offset, $limit, $sortBy, $sortDir, $search, ['name', 'code']);
    }
}
