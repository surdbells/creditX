<?php
declare(strict_types=1);
namespace App\Domain\Repository;

use App\Domain\Entity\NotificationTemplate;

class NotificationTemplateRepository extends BaseRepository
{
    protected function getEntityClass(): string { return NotificationTemplate::class; }

    public function findByCode(string $code): ?NotificationTemplate { return $this->findOneBy(['code' => strtoupper($code)]); }

    public function codeExists(string $code, ?string $excludeId = null): bool
    {
        $qb = $this->em->createQueryBuilder()->select('COUNT(t.id)')->from(NotificationTemplate::class, 't')
            ->where('UPPER(t.code) = :code')->setParameter('code', strtoupper($code));
        if ($excludeId) $qb->andWhere('t.id != :ex')->setParameter('ex', $excludeId);
        return (int) $qb->getQuery()->getSingleScalarResult() > 0;
    }

    /** @return NotificationTemplate[] */
    public function findByEvent(string $eventTrigger): array { return $this->findBy(['eventTrigger' => $eventTrigger, 'isActive' => true]); }

    /** @return array{items: NotificationTemplate[], total: int} */
    public function paginated(int $offset, int $limit, string $sortBy = 'createdAt', string $sortDir = 'DESC', ?string $search = null, ?string $channel = null): array
    {
        $qb = $this->em->createQueryBuilder()->select('t')->from(NotificationTemplate::class, 't');
        if ($channel) $qb->andWhere('t.channel = :ch')->setParameter('ch', $channel);
        return $this->paginatedQuery($qb, 't', $offset, $limit, $sortBy, $sortDir, $search, ['name', 'code', 'eventTrigger']);
    }
}
