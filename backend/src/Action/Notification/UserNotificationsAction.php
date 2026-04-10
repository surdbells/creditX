<?php
declare(strict_types=1);
namespace App\Action\Notification;

use App\Domain\Repository\NotificationRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class UserNotificationsAction
{
    use ApiResponse;
    public function __construct(private readonly NotificationRepository $repo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $userId = $request->getAttribute('user_id');
        $params = $request->getQueryParams();
        $p = $this->getPaginationParams($params);
        $isRead = isset($params['is_read']) ? filter_var($params['is_read'], FILTER_VALIDATE_BOOLEAN) : null;

        $result = $this->repo->paginatedByUser($userId, $p['offset'], $p['per_page'], $isRead);
        $items = array_map(fn($n) => $n->toArray(), $result['items']);
        $unreadCount = $this->repo->getUnreadCount($userId);

        return $this->json([
            'status' => 'success', 'message' => 'Success',
            'data' => $items, 'unread_count' => $unreadCount,
            'meta' => ['total' => $result['total'], 'page' => $p['page'], 'per_page' => $p['per_page'], 'total_pages' => (int) ceil($result['total'] / max($p['per_page'], 1))],
        ]);
    }
}
