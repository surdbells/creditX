<?php
declare(strict_types=1);
namespace App\Action\Reconciliation;
use App\Domain\Repository\ReconciliationRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class ListReconciliationsAction
{
    use ApiResponse;
    public function __construct(private readonly ReconciliationRepository $repo) {}
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $p = $this->getPaginationParams($request->getQueryParams());
        $params = $request->getQueryParams();
        $result = $this->repo->paginated($p['offset'], $p['per_page'], $p['sort_by'], $p['sort_dir'], $params['status'] ?? null, $params['year'] ?? null);
        $items = array_map(fn($r) => $r->toArray(), $result['items']);
        return $this->paginated($items, $result['total'], $p['page'], $p['per_page']);
    }
}
