<?php
declare(strict_types=1);
namespace App\Domain\Repository;

use App\Domain\Entity\InvestmentProduct;

class InvestmentProductRepository extends BaseRepository
{
    protected function getEntityClass(): string { return InvestmentProduct::class; }

    public function findByCode(string $code): ?InvestmentProduct
    {
        return $this->findOneBy(['code' => strtoupper(trim($code))]);
    }

    public function codeExists(string $code, ?string $excludeId = null): bool
    {
        $qb = $this->em->createQueryBuilder()->select('COUNT(p.id)')->from(InvestmentProduct::class, 'p')
            ->where('p.code = :c')->setParameter('c', strtoupper(trim($code)));
        if ($excludeId) $qb->andWhere('p.id != :ex')->setParameter('ex', $excludeId);
        return (int) $qb->getQuery()->getSingleScalarResult() > 0;
    }

    /** @return InvestmentProduct[] */
    public function findActive(): array
    {
        return $this->findBy(['isActive' => true], ['name' => 'ASC']);
    }

    /** @return InvestmentProduct[] */
    public function findAllOrdered(): array
    {
        return $this->findBy([], ['name' => 'ASC']);
    }
}
