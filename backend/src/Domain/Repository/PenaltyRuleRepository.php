<?php
declare(strict_types=1);
namespace App\Domain\Repository;

use App\Domain\Entity\PenaltyRule;

class PenaltyRuleRepository extends BaseRepository
{
    protected function getEntityClass(): string { return PenaltyRule::class; }

    /** @return PenaltyRule[] */
    public function findActiveByProduct(string $productId): array
    {
        return $this->findBy(['product' => $productId, 'isActive' => true], ['createdAt' => 'ASC']);
    }

    /** @return array{items: PenaltyRule[], total: int} */
    public function paginated(int $offset, int $limit, string $sortBy = 'createdAt', string $sortDir = 'DESC', ?string $productId = null): array
    {
        $qb = $this->em->createQueryBuilder()->select('p')->from(PenaltyRule::class, 'p');
        if ($productId) $qb->andWhere('p.product = :pid')->setParameter('pid', $productId);
        return $this->paginatedQuery($qb, 'p', $offset, $limit, $sortBy, $sortDir);
    }
}
