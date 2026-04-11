<?php
declare(strict_types=1);
namespace App\Domain\Repository;

use App\Domain\Entity\DsaTarget;

class DsaTargetRepository extends BaseRepository
{
    protected function getEntityClass(): string { return DsaTarget::class; }

    public function findByUserPeriod(string $userId, string $year, string $month): ?DsaTarget
    {
        return $this->findOneBy(['user' => $userId, 'periodYear' => $year, 'periodMonth' => str_pad($month, 2, '0', STR_PAD_LEFT)]);
    }

    /** @return array{items: DsaTarget[], total: int} */
    public function paginated(int $offset, int $limit, string $sortBy = 'createdAt', string $sortDir = 'DESC', ?string $userId = null, ?string $year = null): array
    {
        $qb = $this->em->createQueryBuilder()->select('d')->from(DsaTarget::class, 'd');
        if ($userId) $qb->andWhere('d.user = :uid')->setParameter('uid', $userId);
        if ($year) $qb->andWhere('d.periodYear = :y')->setParameter('y', $year);
        return $this->paginatedQuery($qb, 'd', $offset, $limit, $sortBy, $sortDir);
    }
}
