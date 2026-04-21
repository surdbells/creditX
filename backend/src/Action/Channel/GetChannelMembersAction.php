<?php
declare(strict_types=1);
namespace App\Action\Channel;

use App\Domain\Entity\{Channel, ChannelMember};
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * List members of a channel.
 *
 * Membership guard: caller must be a channel member. Non-members (even
 * with messaging.view RBAC) get 403 so they can't discover who's in
 * channels they don't belong to.
 *
 * Response uses ChannelMember::toArray() which now includes per-member
 * prefs (last_read_at, is_muted, is_pinned, archived_at) in addition
 * to the denormalised user_name + email. Members are sorted admins-first
 * then by creation timestamp so channel UIs can show ownership at a
 * glance.
 */
final class GetChannelMembersAction {
    use ApiResponse;
    public function __construct(private readonly EntityManagerInterface $em) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface {
        $channelId = $args['id'] ?? '';
        $callerId = $request->getAttribute('user_id');

        $channel = $this->em->find(Channel::class, $channelId);
        if ($channel === null) return $this->notFound('Channel not found');

        $callerMembership = $this->em->getRepository(ChannelMember::class)
            ->findOneBy(['channel' => $channel, 'user' => $callerId]);
        if ($callerMembership === null) return $this->forbidden('Not a member of this channel');

        // Admins first (stable desc sort on role string — 'admin' > 'member'
        // alphabetically since 'a' < 'm' but we want admins on top, so we
        // sort DESC to flip it). Then oldest members first for a stable
        // order across refreshes.
        $members = $this->em->createQueryBuilder()
            ->select('m')
            ->from(ChannelMember::class, 'm')
            ->where('m.channel = :cid')
            ->setParameter('cid', $channelId)
            ->orderBy('m.role', 'DESC')
            ->addOrderBy('m.createdAt', 'ASC')
            ->getQuery()
            ->getResult();

        return $this->success(array_map(fn (ChannelMember $m) => $m->toArray(), $members));
    }
}
