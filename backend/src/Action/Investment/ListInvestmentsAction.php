<?php
declare(strict_types=1);
namespace App\Action\Investment;

use App\Domain\Repository\InvestmentRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GET /api/investments — paginated investments.
 * Filters: status, type, product_id, customer_id. Gated by investments.view.
 */
final class ListInvestmentsAction
{
    use ApiResponse;

    public function __construct(private readonly InvestmentRepository $repo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $params = $request->getQueryParams();
        $p = $this->getPaginationParams($params);

        $filters = [];
        foreach (['status', 'type', 'product_id', 'customer_id'] as $k) {
            $filters[$k] = isset($params[$k]) ? (string) $params[$k] : null;
        }

        $result = $this->repo->findPaginated($p['offset'], $p['per_page'], $p['search'] ?: null, $filters, $p['sort_by'], $p['sort_dir']);
        return $this->paginated(array_map(fn($i) => $i->toArray(), $result['items']), $result['total'], $p['page'], $p['per_page']);
    }
}
