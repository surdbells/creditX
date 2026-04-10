<?php
declare(strict_types=1);
namespace App\Action\Audit;

use App\Domain\Repository\AuditLogRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class ListAuditLogsAction
{
    use ApiResponse;
    public function __construct(private readonly AuditLogRepository $repo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $params = $request->getQueryParams();
        $pagination = $this->getPaginationParams($params);
        $result = $this->repo->paginated(
            $pagination['offset'], $pagination['per_page'], $pagination['sort_by'], $pagination['sort_dir'],
            $pagination['search'] ?: null,
            $params['user_id'] ?? null, $params['entity_type'] ?? null,
            $params['action'] ?? null, $params['date_from'] ?? null, $params['date_to'] ?? null,
        );
        $items = array_map(fn($a) => $a->toArray(), $result['items']);
        return $this->paginated($items, $result['total'], $pagination['page'], $pagination['per_page']);
    }
}
