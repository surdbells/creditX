<?php
declare(strict_types=1);
namespace App\Domain\Repository;

use App\Domain\Entity\GovernmentRecord;

class GovernmentRecordRepository extends BaseRepository
{
    protected function getEntityClass(): string { return GovernmentRecord::class; }

    /**
     * Exact Staff ID lookup, insensitive to case and surrounding whitespace.
     *
     * Agents type the prefix inconsistently (pf0044542 / Pf0044542 / PF0044542),
     * and a plain equality match is case-sensitive, so a correct ID would miss.
     * This normalizes both sides while staying an EXACT match — 'PF004454'
     * still does not match 'PF0044542'; it never degrades to a partial search.
     *
     * @return GovernmentRecord[]
     */
    public function findByStaffId(string $staffId): array
    {
        return $this->em->createQueryBuilder()->select('g')->from(GovernmentRecord::class, 'g')
            ->where('UPPER(TRIM(g.staffId)) = :sid')
            ->setParameter('sid', strtoupper(trim($staffId)))
            ->orderBy('g.createdAt', 'DESC')
            ->getQuery()->getResult();
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
