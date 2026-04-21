<?php
declare(strict_types=1);
namespace App\Action\Channel;

use App\Domain\Entity\{Channel, ChannelMember, ChannelMessage, User};
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Send a message to a channel.
 *
 * Membership is required — RBAC permission alone does NOT grant send
 * rights. An authorised user still can't post to a channel they're
 * not part of. The check happens before we instantiate the message
 * so we don't write a partial record on 403.
 *
 * Body validation: trimmed non-empty. The entity's setBody() trims
 * too, but we need a non-empty-after-trim check at the action layer
 * to return a validation error (400) rather than a silent empty post.
 */
final class SendChannelMessageAction {
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

        return $this->created($msg->toArray(), 'Message sent');
    }
}
