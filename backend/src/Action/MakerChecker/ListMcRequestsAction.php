<?php
declare(strict_types=1);
namespace App\Action\MakerChecker;

use App\Domain\Repository\MakerCheckerRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class ListMcRequestsAction
{
    use ApiResponse;
    public function __construct(private readonly MakerCheckerRepository $repo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $params = $request->getQueryParams();
        $p = $this->getPaginationParams($params);
        $result = $this->repo->paginated($p['offset'], $p['per_page'], $p['sort_by'], $p['sort_dir'], $params['status'] ?? null, $params['operation_type'] ?? null);
        $items = array_map(fn($m) => $m->toArray(), $result['items']);
        return $this->paginated($items, $result['total'], $p['page'], $p['per_page']);
    }
}
