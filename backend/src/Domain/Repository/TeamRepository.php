<?php
declare(strict_types=1);
namespace App\Domain\Repository;

use App\Domain\Entity\Team;

class TeamRepository extends BaseRepository
{
    protected function getEntityClass(): string { return Team::class; }

    public function paginated(int $offset, int $limit, string $sortBy = 'createdAt', string $sortDir = 'DESC', ?string $search = null, ?string $departmentId = null): array
    {
        $qb = $this->em->createQueryBuilder()->select('t')->from(Team::class, 't');
        if ($departmentId) $qb->andWhere('t.department = :did')->setParameter('did', $departmentId);
        return $this->paginatedQuery($qb, 't', $offset, $limit, $sortBy, $sortDir, $search, ['name', 'code']);
    }

    public function findByDepartment(string $departmentId): array
    {
        return $this->findBy(['department' => $departmentId], ['name' => 'ASC']);
    }
}
