<?php
declare(strict_types=1);
namespace App\Action\Messaging;

use App\Domain\Repository\ConversationRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class GetConversationAction
{
    use ApiResponse;
    public function __construct(private readonly ConversationRepository $repo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $conv = $this->repo->find($args['id'] ?? '');
        if ($conv === null) return $this->notFound('Conversation not found');

        // Read-marking is out-of-band — see MarkConversationReadAction.
        // This GET stays pure so the admin UI polling it every 5s
        // doesn't silently clear unread counts for a user who isn't
        // actually looking at the thread.
        $userId = $request->getAttribute('user_id');
        return $this->success($conv->toArray(true, $userId));
    }
}
