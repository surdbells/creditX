<?php
declare(strict_types=1);
namespace App\Action\Channel;

use App\Domain\Entity\{Channel, ChannelMember, ChannelMessage};
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Get messages for a channel.
 *
 * Enforces membership: the caller must be a ChannelMember of this
 * channel, not merely have the messaging.view RBAC permission. RBAC
 * permission alone would let any staff with messaging access read
 * every channel's history — e.g. a junior agent reading the
 * executive-leadership channel. The membership check is cheap
 * (indexed lookup on channel_id + user_id) and is the canonical
 * access gate for channel content.
 *
 * Messages are returned oldest-first, capped at 200. The agent UI
 * renders them top-down; chronological order keeps conversation
 * threading natural. 200 is enough for a typical session — if we
 * later need scrollback, we add a `before` cursor param.
 */
final class GetChannelMessagesAction {
    use ApiResponse;
    public function __construct(private readonly EntityManagerInterface $em) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface {
        $channelId = $args['id'] ?? '';
        $userId = $request->getAttribute('user_id');

        $channel = $this->em->find(Channel::class, $channelId);
        if ($channel === null) return $this->notFound('Channel not found');

        $isMember = $this->em->getRepository(ChannelMember::class)
            ->findOneBy(['channel' => $channel, 'user' => $userId]);
        if ($isMember === null) return $this->forbidden('Not a member of this channel');

        $msgs = $this->em->createQueryBuilder()
            ->select('m')->from(ChannelMessage::class, 'm')
            ->where('m.channel = :cid')
            ->setParameter('cid', $channelId)
            ->orderBy('m.createdAt', 'ASC')
            ->setMaxResults(200)
            ->getQuery()
            ->getResult();

        return $this->success(array_map(fn ($m) => $m->toArray(), $msgs));
    }
}
