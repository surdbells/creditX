<?php
declare(strict_types=1);
namespace App\Domain\Repository;

use App\Domain\Entity\MakerCheckerRequest;

class MakerCheckerRepository extends BaseRepository
{
    protected function getEntityClass(): string { return MakerCheckerRequest::class; }

    /** @return array{items: MakerCheckerRequest[], total: int} */
    public function paginated(int $offset, int $limit, string $sortBy = 'createdAt', string $sortDir = 'DESC', ?string $status = null, ?string $operationType = null): array
    {
        $qb = $this->em->createQueryBuilder()->select('m')->from(MakerCheckerRequest::class, 'm');
        if ($status) $qb->andWhere('m.status = :s')->setParameter('s', $status);
        if ($operationType) $qb->andWhere('m.operationType = :ot')->setParameter('ot', $operationType);
        return $this->paginatedQuery($qb, 'm', $offset, $limit, $sortBy, $sortDir);
    }
}
