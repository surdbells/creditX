<?php
declare(strict_types=1);
namespace App\Action\Channel;

use App\Domain\Entity\{Channel, ChannelMember};
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Mark a channel as read by the current user.
 *
 * Route: POST /api/channels/{id}/mark-read
 *
 * Called by clients when the user opens / views the channel thread.
 * Updates the caller's own ChannelMember.last_read_at to the current
 * time. Unread counts computed elsewhere (UnreadCountAction,
 * ListChannelsAction) key off this timestamp.
 *
 * Membership required. Silently returns 200 with no-op if the user
 * isn't a member (non-members shouldn't be hitting this endpoint,
 * but if they do we don't leak channel existence with a 403 here;
 * a 200-success response is adequate).
 *
 * No audit log — this is a high-frequency UI event (agent opens
 * channel, closes, opens again) and logging every read would drown
 * the audit table. Last_read_at itself serves as the trail.
 */
final class MarkChannelReadAction {
    use ApiResponse;
    public function __construct(private readonly EntityManagerInterface $em) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface {
        $channelId = $args['id'] ?? '';
        $userId = $request->getAttribute('user_id');

        $channel = $this->em->find(Channel::class, $channelId);
        if ($channel === null) return $this->notFound('Channel not found');

        $member = $this->em->getRepository(ChannelMember::class)
            ->findOneBy(['channel' => $channel, 'user' => $userId]);
        if ($member === null) {
            // Quietly succeed — don't leak membership info.
            return $this->success(['marked' => false]);
        }

        $now = new \DateTimeImmutable('now', new \DateTimeZone($_ENV['APP_TIMEZONE'] ?? 'Africa/Lagos'));
        $member->setLastReadAt($now);
        $this->em->flush();

        return $this->success([
            'marked' => true,
            'last_read_at' => $now->format('Y-m-d H:i:s'),
        ]);
    }
}
