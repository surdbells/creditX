<?php
declare(strict_types=1);
namespace App\Domain\Repository;

use App\Domain\Entity\DocumentTypeConfig;

class DocumentTypeConfigRepository extends BaseRepository
{
    protected function getEntityClass(): string { return DocumentTypeConfig::class; }

    /** All types, ordered for display. @return DocumentTypeConfig[] */
    public function findAllOrdered(): array
    {
        return $this->em->createQueryBuilder()->select('d')->from(DocumentTypeConfig::class, 'd')
            ->orderBy('d.sortOrder', 'ASC')->addOrderBy('d.label', 'ASC')
            ->getQuery()->getResult();
    }

    /** Active types only — what capture offers. @return DocumentTypeConfig[] */
    public function findActive(): array
    {
        return $this->em->createQueryBuilder()->select('d')->from(DocumentTypeConfig::class, 'd')
            ->where('d.isActive = true')
            ->orderBy('d.sortOrder', 'ASC')->addOrderBy('d.label', 'ASC')
            ->getQuery()->getResult();
    }

    /**
     * Types that block submit-for-approval: required AND active. An inactive
     * type is never enforced, so deactivating is the safe way to retire one.
     *
     * @return DocumentTypeConfig[]
     */
    public function findRequiredActive(): array
    {
        return $this->em->createQueryBuilder()->select('d')->from(DocumentTypeConfig::class, 'd')
            ->where('d.isActive = true')->andWhere('d.isRequired = true')
            ->orderBy('d.sortOrder', 'ASC')
            ->getQuery()->getResult();
    }

    public function findByCode(string $code): ?DocumentTypeConfig
    {
        return $this->findOneBy(['code' => strtolower(trim($code))]);
    }

    public function codeExists(string $code, ?string $excludeId = null): bool
    {
        $qb = $this->em->createQueryBuilder()->select('COUNT(d.id)')->from(DocumentTypeConfig::class, 'd')
            ->where('d.code = :c')->setParameter('c', strtolower(trim($code)));
        if ($excludeId) $qb->andWhere('d.id != :ex')->setParameter('ex', $excludeId);
        return (int) $qb->getQuery()->getSingleScalarResult() > 0;
    }
}
