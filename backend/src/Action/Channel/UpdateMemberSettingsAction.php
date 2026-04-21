<?php
declare(strict_types=1);
namespace App\Action\Channel;

use App\Domain\Entity\{Channel, ChannelMember};
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Update the calling user's per-channel preferences.
 *
 * Route: PATCH /api/channels/{id}/member-settings
 *
 * Users control their own view of a channel via three independent flags:
 *
 *   is_muted   — suppress push notifications for this channel
 *   is_pinned  — bubble this channel to the top of the list
 *   archived   — boolean input translated to archived_at timestamp;
 *                true  → archived_at = now()
 *                false → archived_at = null (unarchive)
 *
 * Payload fields are all OPTIONAL. Only the provided fields are updated;
 * omitted fields keep their current values. This lets the client send
 * { is_muted: true } without needing to know the current pin/archive
 * state.
 *
 * No audit log — these are personal settings with no security impact
 * and high UI frequency (pin/unpin can happen many times a day).
 */
final class UpdateMemberSettingsAction {
    use ApiResponse;
    public function __construct(private readonly EntityManagerInterface $em) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface {
        $channelId = $args['id'] ?? '';
        $userId = $request->getAttribute('user_id');

        $channel = $this->em->find(Channel::class, $channelId);
        if ($channel === null) return $this->notFound('Channel not found');

        $member = $this->em->getRepository(ChannelMember::class)
            ->findOneBy(['channel' => $channel, 'user' => $userId]);
        if ($member === null) return $this->forbidden('Not a member of this channel');

        $data = (array) ($request->getParsedBody() ?? []);

        if (array_key_exists('is_muted', $data)) {
            $member->setIsMuted((bool) filter_var($data['is_muted'], FILTER_VALIDATE_BOOLEAN));
        }

        if (array_key_exists('is_pinned', $data)) {
            $member->setIsPinned((bool) filter_var($data['is_pinned'], FILTER_VALIDATE_BOOLEAN));
        }

        // archived is input as bool; stored as timestamp so UIs can show
        // 'archived 3 days ago' etc. true sets archived_at = now(),
        // false clears it.
        if (array_key_exists('archived', $data)) {
            $archived = (bool) filter_var($data['archived'], FILTER_VALIDATE_BOOLEAN);
            if ($archived) {
                $now = new \DateTimeImmutable('now', new \DateTimeZone($_ENV['APP_TIMEZONE'] ?? 'Africa/Lagos'));
                $member->setArchivedAt($now);
            } else {
                $member->setArchivedAt(null);
            }
        }

        $this->em->flush();

        return $this->success([
            'is_muted'    => $member->isMuted(),
            'is_pinned'   => $member->isPinned(),
            'archived_at' => $member->getArchivedAt()?->format('Y-m-d H:i:s'),
        ], 'Settings updated');
    }
}
