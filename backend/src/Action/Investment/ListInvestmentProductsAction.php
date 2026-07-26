<?php
declare(strict_types=1);
namespace App\Action\Investment;

use App\Domain\Repository\InvestmentProductRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GET /api/investments/products[?active=true] — investment product templates.
 * Gated by investments.view.
 */
final class ListInvestmentProductsAction
{
    use ApiResponse;

    public function __construct(private readonly InvestmentProductRepository $repo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $q = $request->getQueryParams();
        $activeOnly = isset($q['active']) && filter_var($q['active'], FILTER_VALIDATE_BOOLEAN);
        $items = $activeOnly ? $this->repo->findActive() : $this->repo->findAllOrdered();
        return $this->success(array_map(fn($p) => $p->toArray(), $items));
    }
}
