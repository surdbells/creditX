<?php
declare(strict_types=1);
namespace App\Action\Channel;

use App\Domain\Entity\{Channel, ChannelMember, ChannelMessage};
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * List channels the current user is a member of.
 *
 * Per-row payload:
 *   id, name, description, type, is_active, created_at,
 *   member_count,       // total members in the channel
 *   unread_count,       // messages newer than user's last_read_at, from others
 *   last_message_at,    // timestamp of newest message in channel (nullable)
 *   is_muted,           // user's personal mute flag
 *   is_pinned,          // user's personal pin flag
 *   role,               // 'admin' | 'member' — caller's role in the channel
 *
 * Filtering:
 *   By default, archived channels (from the caller's perspective) are
 *   hidden. Pass ?include_archived=1 to include them.
 *
 * Sort order:
 *   1. Pinned channels first (is_pinned = true bubble to top)
 *   2. Then by last_message_at DESC (most recently active first)
 *   3. Ties broken by channel created_at DESC
 *
 * Note: this action hits the DB several times per channel (member
 * count, last message, unread count). Channel counts per user are
 * typically <20 so this is fine. If that grows we can switch to
 * a single denormalised query with subselects.
 */
final class ListChannelsAction {
    use ApiResponse;
    public function __construct(private readonly EntityManagerInterface $em) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface {
        $userId = $request->getAttribute('user_id');
        $qp = $request->getQueryParams();
        $includeArchived = !empty($qp['include_archived'])
            && filter_var($qp['include_archived'], FILTER_VALIDATE_BOOLEAN);

        // Pull user's memberships (with the channel eager-joined so we don't
        // round-trip the DB once per row later).
        $qb = $this->em->createQueryBuilder()
            ->select('cm', 'c')
            ->from(ChannelMember::class, 'cm')
            ->innerJoin('cm.channel', 'c')
            ->where('cm.user = :uid')
            ->andWhere('c.isActive = true')
            ->setParameter('uid', $userId);

        if (!$includeArchived) {
            $qb->andWhere('cm.archivedAt IS NULL');
        }

        $memberships = $qb->getQuery()->getResult();

        $out = [];
        foreach ($memberships as $cm) {
            /** @var ChannelMember $cm */
            $channel = $cm->getChannel();
            $channelId = $channel->getId();

            // Total members in this channel
            $memberCount = (int) $this->em->createQueryBuilder()
                ->select('COUNT(m.id)')
                ->from(ChannelMember::class, 'm')
                ->where('m.channel = :cid')
                ->setParameter('cid', $channelId)
                ->getQuery()
                ->getSingleScalarResult();

            // Most recent message — for list ordering + display hint
            $lastMsg = $this->em->createQueryBuilder()
                ->select('MAX(msg.createdAt)')
                ->from(ChannelMessage::class, 'msg')
                ->where('msg.channel = :cid')
                ->setParameter('cid', $channelId)
                ->getQuery()
                ->getSingleScalarResult();

            // Unread = messages after last_read_at, from someone else
            $unreadQb = $this->em->createQueryBuilder()
                ->select('COUNT(msg.id)')
                ->from(ChannelMessage::class, 'msg')
                ->where('msg.channel = :cid')
                ->andWhere('msg.sender != :uid')
                ->setParameter('cid', $channelId)
                ->setParameter('uid', $userId);

            if ($cm->getLastReadAt() !== null) {
                $unreadQb->andWhere('msg.createdAt > :lr')->setParameter('lr', $cm->getLastReadAt());
            }

            $unread = (int) $unreadQb->getQuery()->getSingleScalarResult();

            $row = array_merge($channel->toArray(), [
                'member_count'    => $memberCount,
                'unread_count'    => $unread,
                'last_message_at' => $lastMsg instanceof \DateTimeInterface
                    ? $lastMsg->format('Y-m-d H:i:s')
                    : ($lastMsg ?: null),
                'is_muted'        => $cm->isMuted(),
                'is_pinned'       => $cm->isPinned(),
                'archived_at'     => $cm->getArchivedAt()?->format('Y-m-d H:i:s'),
                'role'            => $cm->getRole(),
            ]);
            $out[] = $row;
        }

        // Sort: pinned first, then newest activity, then newest channel
        usort($out, function (array $a, array $b): int {
            if ($a['is_pinned'] !== $b['is_pinned']) {
                return $a['is_pinned'] ? -1 : 1;
            }
            $aAct = $a['last_message_at'] ?? $a['created_at'];
            $bAct = $b['last_message_at'] ?? $b['created_at'];
            return strcmp((string) $bAct, (string) $aAct);
        });

        return $this->success($out);
    }
}
