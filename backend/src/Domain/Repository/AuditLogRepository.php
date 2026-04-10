<?php

declare(strict_types=1);

namespace App\Domain\Repository;

use App\Domain\Entity\AuditLog;

class AuditLogRepository extends BaseRepository
{
    protected function getEntityClass(): string
    {
        return AuditLog::class;
    }

    /**
     * @return array{items: AuditLog[], total: int}
     */
    public function paginated(
        int $offset,
        int $limit,
        string $sortBy = 'createdAt',
        string $sortDir = 'DESC',
        ?string $search = null,
        ?string $userId = null,
        ?string $entityType = null,
        ?string $action = null,
        ?string $dateFrom = null,
        ?string $dateTo = null,
    ): array {
        $qb = $this->em->createQueryBuilder()
            ->select('a')
            ->from(AuditLog::class, 'a');

        if ($userId !== null) {
            $qb->andWhere('a.userId = :userId')
               ->setParameter('userId', $userId);
        }

        if ($entityType !== null) {
            $qb->andWhere('a.entityType = :entityType')
               ->setParameter('entityType', $entityType);
        }

        if ($action !== null) {
            $qb->andWhere('a.action = :action')
               ->setParameter('action', $action);
        }

        if ($dateFrom !== null) {
            $qb->andWhere('a.createdAt >= :dateFrom')
               ->setParameter('dateFrom', new \DateTimeImmutable($dateFrom));
        }

        if ($dateTo !== null) {
            $qb->andWhere('a.createdAt <= :dateTo')
               ->setParameter('dateTo', new \DateTimeImmutable($dateTo . ' 23:59:59'));
        }

        return $this->paginatedQuery(
            $qb, 'a', $offset, $limit, $sortBy, $sortDir,
            $search, ['entityType', 'entityId']
        );
    }
}
