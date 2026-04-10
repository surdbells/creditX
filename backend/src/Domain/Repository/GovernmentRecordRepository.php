<?php
declare(strict_types=1);
namespace App\Domain\Repository;

use App\Domain\Entity\GovernmentRecord;

class GovernmentRecordRepository extends BaseRepository
{
    protected function getEntityClass(): string { return GovernmentRecord::class; }

    public function findByStaffId(string $staffId): array
    {
        return $this->findBy(['staffId' => $staffId], ['createdAt' => 'DESC']);
    }

    public function findOneByTypeAndStaffId(string $recordTypeId, string $staffId): ?GovernmentRecord
    {
        return $this->findOneBy(['recordType' => $recordTypeId, 'staffId' => $staffId]);
    }

    /** Check if staff_id exists within a specific record type */
    public function staffIdExistsInType(string $recordTypeId, string $staffId, ?string $excludeId = null): bool
    {
        $qb = $this->em->createQueryBuilder()->select('COUNT(g.id)')->from(GovernmentRecord::class, 'g')
            ->where('g.recordType = :rtId')->andWhere('g.staffId = :sid')
            ->setParameter('rtId', $recordTypeId)->setParameter('sid', $staffId);
        if ($excludeId) $qb->andWhere('g.id != :ex')->setParameter('ex', $excludeId);
        return (int) $qb->getQuery()->getSingleScalarResult() > 0;
    }

    /** @return array{items: GovernmentRecord[], total: int} */
    public function paginated(int $offset, int $limit, string $sortBy = 'createdAt', string $sortDir = 'DESC', ?string $search = null, ?string $recordTypeId = null, ?bool $isActive = null): array
    {
        $qb = $this->em->createQueryBuilder()->select('g')->from(GovernmentRecord::class, 'g');
        if ($recordTypeId) $qb->andWhere('g.recordType = :rtId')->setParameter('rtId', $recordTypeId);
        if ($isActive !== null) $qb->andWhere('g.isActive = :active')->setParameter('active', $isActive);
        return $this->paginatedQuery($qb, 'g', $offset, $limit, $sortBy, $sortDir, $search, ['staffId', 'employeeName', 'organization', 'jobTitle']);
    }
}
