<?php
declare(strict_types=1);
namespace App\Action\Messaging;

use App\Domain\Repository\ConversationRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class ResolveConversationAction
{
    use ApiResponse;
    public function __construct(private readonly ConversationRepository $repo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $conv = $this->repo->find($args['id'] ?? '');
        if ($conv === null) return $this->notFound('Conversation not found');

        $data = (array) ($request->getParsedBody() ?? []);
        $action = $data['action'] ?? 'resolve';

        if ($action === 'close') $conv->close();
        else $conv->resolve();

        $this->repo->flush();
        return $this->success($conv->toArray(), 'Conversation ' . ($action === 'close' ? 'closed' : 'resolved'));
    }
}
