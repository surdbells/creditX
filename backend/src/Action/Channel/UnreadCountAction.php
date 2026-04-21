<?php
declare(strict_types=1);
namespace App\Action\Channel;

use App\Domain\Entity\{ChannelMember, ChannelMessage, Conversation, Message};
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Unread counts for the authenticated user — 1:1 conversations + channels.
 *
 * Conversation unread:
 *   Messages on Conversations where this user is the agent, sent by
 *   someone else, with isRead = false.
 *
 * Channel unread (new in 6.5):
 *   For each of the user's ChannelMember rows that isn't archived:
 *     - If last_read_at IS NULL: all messages not authored by the user count
 *     - Otherwise: messages with created_at > last_read_at, not authored
 *       by the user, count
 *   Muted channels are counted — mute only suppresses pushes; the badge
 *   is still accurate.
 *
 * Both branches are try/catch-wrapped so one side failing doesn't take
 * down the total badge.
 */
final class UnreadCountAction {
    use ApiResponse;
    public function __construct(private readonly EntityManagerInterface $em) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface {
        $userId = $request->getAttribute('user_id');

        $convCount = 0;
        try {
            $convCount = (int) $this->em->createQueryBuilder()
                ->select('COUNT(m.id)')
                ->from(Message::class, 'm')
                ->innerJoin('m.conversation', 'c')
                ->where('c.agent = :uid')
                ->andWhere('m.senderId != :uid')
                ->andWhere('m.isRead = false')
                ->setParameter('uid', $userId)
                ->getQuery()
                ->getSingleScalarResult();
        } catch (\Throwable $e) {
            $convCount = 0;
        }

        $chanCount = 0;
        try {
            // Pull the user's non-archived memberships. Keyed by channel_id
            // so we can look up last_read_at per channel in the message
            // query below.
            $memberships = $this->em->createQueryBuilder()
                ->select('cm')
                ->from(ChannelMember::class, 'cm')
                ->where('cm.user = :uid')
                ->andWhere('cm.archivedAt IS NULL')
                ->setParameter('uid', $userId)
                ->getQuery()
                ->getResult();

            foreach ($memberships as $cm) {
                /** @var ChannelMember $cm */
                $channel = $cm->getChannel();
                $lastRead = $cm->getLastReadAt();

                $qb = $this->em->createQueryBuilder()
                    ->select('COUNT(msg.id)')
                    ->from(ChannelMessage::class, 'msg')
                    ->where('msg.channel = :cid')
                    ->andWhere('msg.sender != :uid')
                    ->setParameter('cid', $channel->getId())
                    ->setParameter('uid', $userId);

                if ($lastRead !== null) {
                    $qb->andWhere('msg.createdAt > :lr')->setParameter('lr', $lastRead);
                }

                $chanCount += (int) $qb->getQuery()->getSingleScalarResult();
            }
        } catch (\Throwable $e) {
            $chanCount = 0;
        }

        return $this->success([
            'conversations' => $convCount,
            'channels'      => $chanCount,
            'total'         => $convCount + $chanCount,
        ]);
    }
}
