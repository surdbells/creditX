<?php
declare(strict_types=1);
namespace App\Action\Messaging;

use App\Domain\Entity\Message;
use App\Domain\Repository\ConversationRepository;
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Mark a conversation as read by the current user.
 *
 * Route: POST /api/conversations/{id}/read
 *
 * Called by clients when the user opens / focuses the conversation
 * thread. Sets isRead=true on every message in this conversation
 * that was sent by someone OTHER than the caller.
 *
 * ## Why a dedicated endpoint (moved out of GET in this commit)
 *
 * Previously, GetConversationAction and GetConversationMessagesAction
 * both auto-marked messages read as a side effect. Because the admin
 * UI polls the messages endpoint every 5 seconds, this meant unread
 * badges dropped to 0 as soon as a new message arrived from the
 * agent — even if the backoffice user wasn't looking at their screen.
 *
 * Mirrors the channel pattern (MarkChannelReadAction). Read-marking
 * is now an explicit user-intent action triggered by the client on
 * thread open / focus.
 *
 * ## Why bulk UPDATE rather than iterating entities
 *
 * Flipping isRead on dozens of messages one-by-one through Doctrine
 * is N+1-ish and expensive. A single UPDATE with a WHERE clause does
 * the same work in one statement. We also set read_at so the audit
 * trail reflects when the read happened (not just that it did).
 *
 * Gated by messaging.view.
 */
final class MarkConversationReadAction
{
    use ApiResponse;

    public function __construct(
        private readonly ConversationRepository $repo,
        private readonly EntityManagerInterface $em,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $conv = $this->repo->find($args['id'] ?? '');
        if ($conv === null) return $this->notFound('Conversation not found');

        $userId = $request->getAttribute('user_id');
        if ($userId === null) return $this->unauthorized();

        // Bulk mark-read. We only flip messages where:
        //   - they belong to this conversation
        //   - sender is not the current user
        //   - they're currently unread (avoid re-setting read_at on
        //     already-read rows, which would mangle the audit trail)
        $now = new \DateTimeImmutable('now', new \DateTimeZone($_ENV['APP_TIMEZONE'] ?? 'Africa/Lagos'));
        $affected = $this->em->createQueryBuilder()
            ->update(Message::class, 'm')
            ->set('m.isRead', ':t')
            ->set('m.readAt', ':now')
            ->where('m.conversation = :cid')
            ->andWhere('m.senderId != :uid')
            ->andWhere('m.isRead = false')
            ->setParameter('t', true)
            ->setParameter('now', $now)
            ->setParameter('cid', $conv->getId())
            ->setParameter('uid', $userId)
            ->getQuery()
            ->execute();

        return $this->success([
            'marked' => (int) $affected,
            'read_at' => $now->format('Y-m-d H:i:s'),
        ]);
    }
}
