<?php
declare(strict_types=1);
namespace App\Domain\Repository;

use App\Domain\Entity\BulkUpload;

class BulkUploadRepository extends BaseRepository
{
    protected function getEntityClass(): string { return BulkUpload::class; }

    /** @return array{items: BulkUpload[], total: int} */
    public function paginated(int $offset, int $limit, string $sortBy = 'createdAt', string $sortDir = 'DESC', ?string $status = null): array
    {
        $qb = $this->em->createQueryBuilder()->select('b')->from(BulkUpload::class, 'b');
        if ($status) $qb->andWhere('b.status = :st')->setParameter('st', $status);
        return $this->paginatedQuery($qb, 'b', $offset, $limit, $sortBy, $sortDir);
    }
}
