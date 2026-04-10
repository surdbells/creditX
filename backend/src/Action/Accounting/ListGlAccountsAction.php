<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Domain\Repository\GeneralLedgerRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class ListGlAccountsAction
{
    use ApiResponse;
    public function __construct(private readonly GeneralLedgerRepository $repo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $params = $request->getQueryParams();
        $p = $this->getPaginationParams($params);
        $result = $this->repo->paginated($p['offset'], $p['per_page'], $p['sort_by'], $p['sort_dir'], $p['search'] ?: null, $params['account_type'] ?? null, $params['ledger_type'] ?? null);
        $items = array_map(fn($g) => $g->toArray(), $result['items']);
        return $this->paginated($items, $result['total'], $p['page'], $p['per_page']);
    }
}
