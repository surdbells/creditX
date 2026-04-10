<?php
declare(strict_types=1);
namespace App\Action\Messaging;

use App\Domain\Repository\ConversationRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class ListConversationsAction
{
    use ApiResponse;
    public function __construct(private readonly ConversationRepository $repo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $params = $request->getQueryParams();
        $p = $this->getPaginationParams($params);
        $userId = $request->getAttribute('user_id');
        $userRoles = $request->getAttribute('user_roles', []);

        // Agents see only their own conversations; backoffice sees all
        if (in_array('agent', $userRoles, true) && !in_array('super_admin', $userRoles, true)) {
            $result = $this->repo->paginatedByAgent($userId, $p['offset'], $p['per_page'], $params['status'] ?? null);
        } else {
            $result = $this->repo->paginatedAll($p['offset'], $p['per_page'], $params['status'] ?? null, $p['search'] ?: null);
        }

        $items = array_map(fn($c) => $c->toArray(false, $userId), $result['items']);
        return $this->paginated($items, $result['total'], $p['page'], $p['per_page']);
    }
}
