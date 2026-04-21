<?php
declare(strict_types=1);
namespace App\Action\Channel;

use App\Domain\Entity\{Channel, ChannelMember};
use App\Infrastructure\Service\{ApiResponse, AuditService};
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Remove a member from a channel.
 *
 * Route: DELETE /api/channels/{id}/members/{userId}
 *
 * Authorisation model:
 *   - Caller must be a member of the channel
 *   - Caller must be a channel admin (role='admin') OR removing themself
 *     (users can always leave a channel). Non-admin members cannot kick
 *     other members.
 *   - A channel must retain at least one admin. Removing the last admin
 *     returns 409 to prevent orphaning.
 *
 * Audit: logged as 'ChannelMember' delete with the removed user's id
 * as the target and the channel id in details, so the trail captures
 * both who was removed and from which channel.
 */
final class RemoveChannelMemberAction {
    use ApiResponse;

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly AuditService $audit,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface {
        $channelId = $args['id'] ?? '';
        $targetUserId = $args['userId'] ?? '';
        $callerId = $request->getAttribute('user_id');

        $channel = $this->em->find(Channel::class, $channelId);
        if ($channel === null) return $this->notFound('Channel not found');

        // Caller's own membership
        $callerMember = $this->em->getRepository(ChannelMember::class)
            ->findOneBy(['channel' => $channel, 'user' => $callerId]);
        if ($callerMember === null) return $this->forbidden('Not a member of this channel');

        // Target membership
        $targetMember = $this->em->getRepository(ChannelMember::class)
            ->findOneBy(['channel' => $channel, 'user' => $targetUserId]);
        if ($targetMember === null) return $this->notFound('User is not a member of this channel');

        // Authorisation: admin OR self-removal
        $isSelfRemoval = $callerId === $targetUserId;
        $isAdmin = $callerMember->getRole() === 'admin';
        if (!$isAdmin && !$isSelfRemoval) {
            return $this->forbidden('Only channel admins can remove other members');
        }

        // Prevent removing the last admin. If the target is an admin, make
        // sure there will still be at least one admin after removal.
        if ($targetMember->getRole() === 'admin') {
            $adminCount = (int) $this->em->createQueryBuilder()
                ->select('COUNT(m.id)')
                ->from(ChannelMember::class, 'm')
                ->where('m.channel = :cid')
                ->andWhere('m.role = :r')
                ->setParameter('cid', $channelId)
                ->setParameter('r', 'admin')
                ->getQuery()
                ->getSingleScalarResult();
            if ($adminCount <= 1) {
                return $this->error('Cannot remove the last channel admin. Promote another member to admin first.', 409);
            }
        }

        $this->em->remove($targetMember);
        $this->em->flush();

        $this->audit->logDelete(
            $callerId,
            'ChannelMember',
            $targetMember->getId(),
            ['channel_id' => $channelId, 'removed_user_id' => $targetUserId, 'self_removal' => $isSelfRemoval],
            $this->getClientIp($request),
            $this->getUserAgent($request),
        );

        return $this->success(null, $isSelfRemoval ? 'You left the channel' : 'Member removed');
    }
}
