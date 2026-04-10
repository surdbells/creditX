<?php
declare(strict_types=1);
namespace App\Action\Notification;

use App\Domain\Repository\NotificationTemplateRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class ListTemplatesAction
{
    use ApiResponse;
    public function __construct(private readonly NotificationTemplateRepository $repo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $params = $request->getQueryParams();
        $p = $this->getPaginationParams($params);
        $result = $this->repo->paginated($p['offset'], $p['per_page'], $p['sort_by'], $p['sort_dir'], $p['search'] ?: null, $params['channel'] ?? null);
        $items = array_map(fn($t) => $t->toArray(), $result['items']);
        return $this->paginated($items, $result['total'], $p['page'], $p['per_page']);
    }
}
