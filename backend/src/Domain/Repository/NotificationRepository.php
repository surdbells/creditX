<?php
declare(strict_types=1);
namespace App\Domain\Repository;

use App\Domain\Entity\Notification;
use App\Domain\Enum\NotificationChannel;

class NotificationRepository extends BaseRepository
{
    protected function getEntityClass(): string { return Notification::class; }

    /**
     * A user's in-app notification list. Only IN_APP rows are returned — the
     * email/push/sms rows are delivery records for the same events, not list
     * items, so they'd otherwise clutter the bell.
     *
     * @return array{items: Notification[], total: int}
     */
    public function paginatedByUser(string $userId, int $offset, int $limit, ?bool $isRead = null): array
    {
        $qb = $this->em->createQueryBuilder()->select('n')->from(Notification::class, 'n')
            ->where('n.userId = :uid')->setParameter('uid', $userId)
            ->andWhere('n.channel = :ch')->setParameter('ch', NotificationChannel::IN_APP);
        if ($isRead !== null) $qb->andWhere('n.isRead = :read')->setParameter('read', $isRead);

        $countQb = clone $qb;
        $countQb->select('COUNT(n.id)')->resetDQLPart('orderBy');
        $total = (int) $countQb->getQuery()->getSingleScalarResult();

        $qb->orderBy('n.createdAt', 'DESC')->setFirstResult($offset)->setMaxResults($limit);
        return ['items' => $qb->getQuery()->getResult(), 'total' => $total];
    }

    /** Unread count for the bell — in-app only, matching the list. */
    public function getUnreadCount(string $userId): int
    {
        return (int) $this->em->createQueryBuilder()->select('COUNT(n.id)')->from(Notification::class, 'n')
            ->where('n.userId = :uid')->andWhere('n.isRead = false')
            ->andWhere('n.channel = :ch')->setParameter('ch', NotificationChannel::IN_APP)
            ->setParameter('uid', $userId)
            ->getQuery()->getSingleScalarResult();
    }

    /** Mark all user IN_APP notifications as read */
    public function markAllRead(string $userId): int
    {
        return $this->em->createQueryBuilder()->update(Notification::class, 'n')
            ->set('n.isRead', 'true')
            ->where('n.userId = :uid')->andWhere('n.isRead = false')
            ->andWhere('n.channel = :ch')->setParameter('ch', NotificationChannel::IN_APP)
            ->setParameter('uid', $userId)
            ->getQuery()->execute();
    }
}
