<?php
declare(strict_types=1);
namespace App\Action\Notification;

use App\Domain\Repository\NotificationRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class MarkNotificationsReadAction
{
    use ApiResponse;
    public function __construct(private readonly NotificationRepository $repo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $userId = $request->getAttribute('user_id');
        $marked = $this->repo->markAllRead($userId);
        return $this->success(['marked_read' => $marked], 'Notifications marked as read');
    }
}
