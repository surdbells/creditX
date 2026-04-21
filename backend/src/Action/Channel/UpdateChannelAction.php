<?php
declare(strict_types=1);
namespace App\Action\Channel;

use App\Domain\Entity\{Channel, ChannelMember};
use App\Infrastructure\Service\{ApiResponse, AuditService};
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Update channel metadata (name, description).
 *
 * Route: PATCH /api/channels/{id}
 *
 * Only channel admins can modify metadata. Non-admin members get 403.
 * Non-members get 403 via the membership check (we don't leak the
 * existence of channels a user isn't in).
 *
 * Supported fields:
 *   - name        (non-empty string, trimmed)
 *   - description (nullable string)
 *
 * `type` and `isActive` are NOT editable via this endpoint. Changing
 * a channel's type post-creation has unclear semantics (a group
 * becoming a channel changes member-admission rules); deactivation
 * is a future concern that deserves its own endpoint with soft-delete
 * semantics. Call it YAGNI for now.
 *
 * Audit: logUpdate with old/new name and description. Keeps the trail
 * grepable for "who renamed what when".
 */
final class UpdateChannelAction {
    use ApiResponse;

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly AuditService $audit,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface {
        $channelId = $args['id'] ?? '';
        $callerId = $request->getAttribute('user_id');

        $channel = $this->em->find(Channel::class, $channelId);
        if ($channel === null) return $this->notFound('Channel not found');

        // Membership + admin check
        $callerMember = $this->em->getRepository(ChannelMember::class)
            ->findOneBy(['channel' => $channel, 'user' => $callerId]);
        if ($callerMember === null) return $this->forbidden('Not a member of this channel');
        if ($callerMember->getRole() !== 'admin') {
            return $this->forbidden('Only channel admins can update channel settings');
        }

        $data = (array) ($request->getParsedBody() ?? []);
        $oldValues = [
            'name' => $channel->getName(),
            'description' => $channel->getDescription(),
        ];

        // name — optional in payload; if present, must be non-empty after trim
        if (array_key_exists('name', $data)) {
            $name = trim((string) $data['name']);
            if ($name === '') return $this->validationError(['name' => 'Name cannot be empty']);
            $channel->setName($name);
        }

        // description — optional; null is a valid explicit clear
        if (array_key_exists('description', $data)) {
            $raw = $data['description'];
            $channel->setDescription($raw === null || $raw === '' ? null : trim((string) $raw));
        }

        $this->em->flush();

        $this->audit->logUpdate(
            $callerId,
            'Channel',
            $channel->getId(),
            $oldValues,
            ['name' => $channel->getName(), 'description' => $channel->getDescription()],
            $this->getClientIp($request),
            $this->getUserAgent($request),
        );

        return $this->success($channel->toArray(), 'Channel updated');
    }
}
