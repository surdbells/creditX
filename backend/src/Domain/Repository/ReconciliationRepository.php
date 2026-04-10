<?php
declare(strict_types=1);
namespace App\Domain\Repository;

use App\Domain\Entity\Reconciliation;

class ReconciliationRepository extends BaseRepository
{
    protected function getEntityClass(): string { return Reconciliation::class; }

    /** @return array{items: Reconciliation[], total: int} */
    public function paginated(int $offset, int $limit, string $sortBy = 'createdAt', string $sortDir = 'DESC', ?string $status = null, ?string $year = null): array
    {
        $qb = $this->em->createQueryBuilder()->select('r')->from(Reconciliation::class, 'r');
        if ($status) $qb->andWhere('r.status = :st')->setParameter('st', $status);
        if ($year) $qb->andWhere('r.periodYear = :y')->setParameter('y', $year);
        return $this->paginatedQuery($qb, 'r', $offset, $limit, $sortBy, $sortDir);
    }
}
