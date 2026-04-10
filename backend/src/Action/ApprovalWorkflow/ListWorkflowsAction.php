<?php
declare(strict_types=1);
namespace App\Action\ApprovalWorkflow;

use App\Domain\Repository\ApprovalWorkflowRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class ListWorkflowsAction
{
    use ApiResponse;
    public function __construct(private readonly ApprovalWorkflowRepository $repo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $params = $request->getQueryParams();
        $p = $this->getPaginationParams($params);
        $result = $this->repo->paginated($p['offset'], $p['per_page'], $p['sort_by'], $p['sort_dir'], $p['search'] ?: null);
        $items = array_map(fn($w) => $w->toArray(), $result['items']);
        return $this->paginated($items, $result['total'], $p['page'], $p['per_page']);
    }
}
