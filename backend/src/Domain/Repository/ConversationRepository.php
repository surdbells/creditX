<?php
declare(strict_types=1);
namespace App\Domain\Repository;

use App\Domain\Entity\Conversation;

class ConversationRepository extends BaseRepository
{
    protected function getEntityClass(): string { return Conversation::class; }

    /** @return array{items: Conversation[], total: int} */
    public function paginatedByAgent(string $agentId, int $offset, int $limit, ?string $status = null): array
    {
        $qb = $this->em->createQueryBuilder()->select('c')->from(Conversation::class, 'c')
            ->where('c.agent = :aid')->setParameter('aid', $agentId);
        if ($status) $qb->andWhere('c.status = :st')->setParameter('st', $status);

        $countQb = clone $qb;
        $countQb->select('COUNT(c.id)')->resetDQLPart('orderBy');
        $total = (int) $countQb->getQuery()->getSingleScalarResult();

        $qb->orderBy('c.lastMessageAt', 'DESC')->setFirstResult($offset)->setMaxResults($limit);
        return ['items' => $qb->getQuery()->getResult(), 'total' => $total];
    }

    /** All conversations for backoffice (all agents) */
    public function paginatedAll(int $offset, int $limit, ?string $status = null, ?string $search = null): array
    {
        $qb = $this->em->createQueryBuilder()->select('c')->from(Conversation::class, 'c')
            ->innerJoin('c.agent', 'a');
        if ($status) $qb->andWhere('c.status = :st')->setParameter('st', $status);
        if ($search && $search !== '') {
            $qb->andWhere($qb->expr()->orX(
                $qb->expr()->like('LOWER(c.subject)', ':search'),
                $qb->expr()->like('LOWER(a.firstName)', ':search'),
                $qb->expr()->like('LOWER(a.lastName)', ':search'),
            ))->setParameter('search', '%' . strtolower($search) . '%');
        }

        $countQb = clone $qb;
        $countQb->select('COUNT(c.id)')->resetDQLPart('orderBy');
        $total = (int) $countQb->getQuery()->getSingleScalarResult();

        $qb->orderBy('c.lastMessageAt', 'DESC')->setFirstResult($offset)->setMaxResults($limit);
        return ['items' => $qb->getQuery()->getResult(), 'total' => $total];
    }
}
