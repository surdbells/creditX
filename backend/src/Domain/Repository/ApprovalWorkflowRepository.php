<?php
declare(strict_types=1);
namespace App\Domain\Repository;

use App\Domain\Entity\ApprovalWorkflow;

class ApprovalWorkflowRepository extends BaseRepository
{
    protected function getEntityClass(): string { return ApprovalWorkflow::class; }

    public function findByProductId(string $productId): ?ApprovalWorkflow
    {
        return $this->findOneBy(['product' => $productId]);
    }

    public function findActiveByProductId(string $productId): ?ApprovalWorkflow
    {
        return $this->findOneBy(['product' => $productId, 'isActive' => true]);
    }

    /** @return array{items: ApprovalWorkflow[], total: int} */
    public function paginated(int $offset, int $limit, string $sortBy = 'createdAt', string $sortDir = 'DESC', ?string $search = null): array
    {
        $qb = $this->em->createQueryBuilder()->select('w')->from(ApprovalWorkflow::class, 'w');
        return $this->paginatedQuery($qb, 'w', $offset, $limit, $sortBy, $sortDir, $search, ['name']);
    }
}
