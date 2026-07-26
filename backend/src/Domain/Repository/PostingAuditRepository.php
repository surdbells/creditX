<?php
declare(strict_types=1);
namespace App\Domain\Repository;

use App\Domain\Entity\PostingAudit;

class PostingAuditRepository extends BaseRepository
{
    protected function getEntityClass(): string { return PostingAudit::class; }

    /**
     * Searchable, exportable backdated-posting log (§16).
     *
     * @param array{from?:?string, to?:?string, user_id?:?string, entry_type?:?string} $filters
     * @return array{items: PostingAudit[], total: int}
     */
    public function findPaginated(int $offset, int $limit, ?string $search, array $filters): array
    {
        $qb = $this->em->createQueryBuilder()->select('a')->from(PostingAudit::class, 'a');

        if (!empty($filters['from'])) {
            $qb->andWhere('a.postingDate >= :from')->setParameter('from', new \DateTimeImmutable($filters['from']));
        }
        if (!empty($filters['to'])) {
            $qb->andWhere('a.postingDate <= :to')->setParameter('to', new \DateTimeImmutable($filters['to']));
        }
        if (!empty($filters['user_id'])) {
            $qb->andWhere('a.userId = :uid')->setParameter('uid', $filters['user_id']);
        }
        if (!empty($filters['entry_type'])) {
            $qb->andWhere('a.entryType = :et')->setParameter('et', $filters['entry_type']);
        }
        if ($search !== null && $search !== '') {
            $qb->andWhere($qb->expr()->orX(
                $qb->expr()->like('LOWER(a.narration)', ':q'),
                $qb->expr()->like('LOWER(a.reason)', ':q'),
                $qb->expr()->like('LOWER(a.journalEntryId)', ':q'),
            ))->setParameter('q', '%' . strtolower($search) . '%');
        }

        $countQb = clone $qb;
        $total = (int) $countQb->select('COUNT(a.id)')->getQuery()->getSingleScalarResult();

        $qb->orderBy('a.createdTimestamp', 'DESC')->setFirstResult($offset)->setMaxResults($limit);
        return ['items' => $qb->getQuery()->getResult(), 'total' => $total];
    }
}
