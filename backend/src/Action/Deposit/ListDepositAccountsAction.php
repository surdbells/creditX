<?php
declare(strict_types=1);
namespace App\Action\Deposit;

use App\Domain\Repository\DepositAccountRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GET /api/deposits/accounts — list deposit accounts.
 * Filters: status, product_id, customer_id. Gated by deposits.view.
 */
final class ListDepositAccountsAction
{
    use ApiResponse;
    public function __construct(private readonly DepositAccountRepository $repo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $params = $request->getQueryParams();

        // Customer-scoped listing is a simple non-paginated convenience.
        if (!empty($params['customer_id'])) {
            $accounts = $this->repo->findByCustomer((string) $params['customer_id']);
            return $this->success(array_map(fn($a) => $a->toArray(), $accounts));
        }

        $p = $this->getPaginationParams($params);
        $result = $this->repo->paginated(
            $p['offset'], $p['per_page'], $p['sort_by'], $p['sort_dir'], $p['search'] ?: null,
            !empty($params['status']) ? (string) $params['status'] : null,
            !empty($params['product_id']) ? (string) $params['product_id'] : null,
        );
        $items = array_map(fn($a) => $a->toArray(), $result['items']);
        return $this->paginated($items, $result['total'], $p['page'], $p['per_page']);
    }
}
