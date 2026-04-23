<?php
declare(strict_types=1);
namespace App\Action\Messaging;

use App\Domain\Entity\{Conversation, Message};
use App\Domain\Repository\ConversationRepository;
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GET /api/conversations/{id}/messages
 *
 * Returns the ordered message list for a conversation. Mirrors the
 * GetChannelMessagesAction shape — a chronological array of
 * `Message::toArray()` rows — but works against Conversation, whose
 * access gate is the loan's agent + backoffice staff (enforced by
 * ConversationRepository::assertCanView).
 *
 * Why a dedicated endpoint rather than /conversations/{id} embedding
 * the messages: the admin UI polls for new messages every 5s, and
 * hitting the conversation detail endpoint on every poll re-serialises
 * the full conversation (loan preview, agent, subject, unread counts)
 * every time — wasteful. This endpoint returns just the messages.
 *
 * Side effect: marks any unread messages from the OTHER party as
 * read. Matches the behaviour of GetConversationAction so the unread
 * counter decrements when you open the thread, regardless of which
 * endpoint the UI hits.
 *
 * Messages are capped at 200 rows, oldest-first. If scrollback
 * becomes necessary, add a `before` cursor param.
 *
 * Gated by messaging.view.
 */
final class GetConversationMessagesAction
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

        // Mark messages from the other party as read. Matches the
        // behaviour of GetConversationAction — opening the thread
        // (via either endpoint) clears the unread count.
        foreach ($conv->getMessages() as $msg) {
            if (!$msg->isRead() && $msg->getSenderId() !== $userId) {
                $msg->markRead();
            }
        }
        $this->repo->flush();

        // Dedicated query (not $conv->getMessages()) so we can bound
        // result size and control ordering independently of the
        // entity mapping.
        $msgs = $this->em->createQueryBuilder()
            ->select('m')->from(Message::class, 'm')
            ->where('m.conversation = :cid')
            ->setParameter('cid', $conv->getId())
            ->orderBy('m.createdAt', 'ASC')
            ->setMaxResults(200)
            ->getQuery()
            ->getResult();

        return $this->success(array_map(fn (Message $m) => $m->toArray(), $msgs));
    }
}
