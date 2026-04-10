<?php
declare(strict_types=1);
namespace App\Action\Penalty;

use App\Domain\Repository\PenaltyRuleRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class ListPenaltyRulesAction
{
    use ApiResponse;
    public function __construct(private readonly PenaltyRuleRepository $repo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $params = $request->getQueryParams();
        $p = $this->getPaginationParams($params);
        $result = $this->repo->paginated($p['offset'], $p['per_page'], $p['sort_by'], $p['sort_dir'], $params['product_id'] ?? null);
        $items = array_map(fn($r) => $r->toArray(), $result['items']);
        return $this->paginated($items, $result['total'], $p['page'], $p['per_page']);
    }
}
