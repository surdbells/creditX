<?php
declare(strict_types=1);
namespace App\Action\Channel;

use App\Domain\Entity\{Channel, ChannelMember, ChannelMessage, User};
use App\Infrastructure\Service\{ApiResponse, PushNotificationService};
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};
use Psr\Log\LoggerInterface;

/**
 * Send a message to a channel.
 *
 * Membership is required — RBAC permission alone does NOT grant send
 * rights. An authorised user still can't post to a channel they're
 * not part of.
 *
 * Body validation: trimmed non-empty.
 *
 * ## Push fan-out (added 6.7)
 *
 * After the message is persisted, we fire a push notification to every
 * channel member EXCEPT:
 *   1. The sender themselves (they don't need to be notified of their
 *      own post).
 *   2. Any member with is_muted = true (per-user channel mute from 6.6
 *      — mute means no push, period).
 *   3. Any member with archived_at != null (archived channels shouldn't
 *      re-surface via push).
 *
 * We use PushNotificationService.sendToUsers directly rather than
 * NotificationDispatchService.dispatchEvent because the dispatcher is
 * oriented around single-user event contexts. Channel messages are
 * naturally multi-recipient and don't fit the template+context model
 * cleanly (the same message text goes to everyone; we just need to
 * iterate device tokens).
 *
 * The push body is the first ~120 chars of the message prefixed with
 * the sender's first name: 'Jane: Hey team, can you review...'. Matches
 * the conventions in Slack / WhatsApp push notifications.
 *
 * The message send itself is NOT contingent on push succeeding — push
 * errors are logged and swallowed. The user should see their message
 * stored even if FCM has an outage.
 */
final class SendChannelMessageAction {
    use ApiResponse;

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly PushNotificationService $push,
        private readonly LoggerInterface $logger,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface {
        $channelId = $args['id'] ?? '';
        $userId = $request->getAttribute('user_id');

        $channel = $this->em->find(Channel::class, $channelId);
        if ($channel === null) return $this->notFound('Channel not found');

        $senderMembership = $this->em->getRepository(ChannelMember::class)
            ->findOneBy(['channel' => $channel, 'user' => $userId]);
        if ($senderMembership === null) return $this->forbidden('Not a member of this channel');

        $data = (array) ($request->getParsedBody() ?? []);
        $body = trim((string) ($data['body'] ?? ''));
        if ($body === '') return $this->validationError(['body' => 'Message body is required']);

        $sender = $this->em->find(User::class, $userId);
        if ($sender === null) return $this->unauthorized('User not found');

        $msg = new ChannelMessage();
        $msg->setChannel($channel);
        $msg->setSender($sender);
        $msg->setBody($body);
        $this->em->persist($msg);
        $this->em->flush();

        // Best-effort push fan-out
        try {
            $recipientIds = $this->em->createQueryBuilder()
                ->select('IDENTITY(cm.user)')
                ->from(ChannelMember::class, 'cm')
                ->where('cm.channel = :cid')
                ->andWhere('cm.user != :uid')
                ->andWhere('cm.isMuted = false')
                ->andWhere('cm.archivedAt IS NULL')
                ->setParameter('cid', $channelId)
                ->setParameter('uid', $userId)
                ->getQuery()
                ->getSingleColumnResult();

            if (!empty($recipientIds)) {
                // Build notification title + body.
                //   Title: channel name (so users see which channel when
                //          multiple notifs arrive)
                //   Body:  '{sender first name}: {message excerpt}'
                $firstName = trim((string) $sender->getFirstName());
                if ($firstName === '') $firstName = trim((string) $sender->getFullName());
                $excerpt = mb_strlen($body) > 120 ? mb_substr($body, 0, 117) . '...' : $body;
                $pushTitle = $channel->getName();
                $pushBody = $firstName !== '' ? "{$firstName}: {$excerpt}" : $excerpt;

                $this->push->sendToUsers(
                    $recipientIds,
                    $pushTitle,
                    $pushBody,
                    [
                        'type'        => 'channel_message',
                        'channel_id'  => $channelId,
                        'message_id'  => $msg->getId(),
                    ],
                );
            }
        } catch (\Throwable $e) {
            // Don't let push failure fail the message send. Log and move on.
            $this->logger->warning('Channel push fan-out failed', [
                'channel_id' => $channelId,
                'message_id' => $msg->getId(),
                'error'      => $e->getMessage(),
            ]);
        }

        return $this->created($msg->toArray(), 'Message sent');
    }
}
