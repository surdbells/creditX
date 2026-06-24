<?php
declare(strict_types=1);
namespace App\Action\Deposit;

use App\Domain\Repository\DepositProductRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/** GET /api/deposits/products — list deposit products. Gated by deposits.view. */
final class ListDepositProductsAction
{
    use ApiResponse;
    public function __construct(private readonly DepositProductRepository $repo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $p = $this->getPaginationParams($request->getQueryParams());
        $result = $this->repo->paginated($p['offset'], $p['per_page'], $p['sort_by'], $p['sort_dir'], $p['search'] ?: null);
        $items = array_map(fn($prod) => $prod->toArray(), $result['items']);
        return $this->paginated($items, $result['total'], $p['page'], $p['per_page']);
    }
}
