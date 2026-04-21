<?php
declare(strict_types=1);
namespace App\Action\Channel;

use App\Domain\Entity\{Conversation, Message};
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Unread counts for the currently authenticated user — both 1:1
 * conversations and channel messages.
 *
 * Conversation unread:
 *   The Conversation entity has a single agent (the user) and a
 *   Message collection where each Message tracks its own isRead flag
 *   plus senderId (a plain string, not a User association). We count
 *   messages where the current user did NOT send them (senderId != user)
 *   and that aren't yet marked read, scoped to conversations where
 *   this user is the agent.
 *
 * Channel unread:
 *   Channels currently lack a per-member last_read_at column, so we
 *   can't compute "unread since last visit". Returning 0 for now; a
 *   future migration on ChannelMember can add the column and this
 *   endpoint will grow smarter. The previous implementation returned
 *   total-messages minus the user's own sends, which wasn't an unread
 *   count in any meaningful sense and misled the UI.
 *
 * Both branches are wrapped in try/catch so a DB or schema error on
 * one side doesn't take down the whole endpoint — the unread badge
 * just shows 0 for that side.
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

        return $this->success([
            'conversations' => $convCount,
            'channels'      => 0,
            'total'         => $convCount,
        ]);
    }
}
