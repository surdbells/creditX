<?php
declare(strict_types=1);
namespace App\Action\Loan;

use App\Domain\Repository\LoanRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class ListLoansAction
{
    use ApiResponse;
    public function __construct(private readonly LoanRepository $repo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $params = $request->getQueryParams();
        $p = $this->getPaginationParams($params);
        $result = $this->repo->paginated($p['offset'], $p['per_page'], $p['sort_by'], $p['sort_dir'], $p['search'] ?: null,
            $params['status'] ?? null, $params['product_id'] ?? null, $params['branch_id'] ?? null, $params['agent_id'] ?? null);
        $items = array_map(fn($l) => $l->toArray(), $result['items']);
        return $this->paginated($items, $result['total'], $p['page'], $p['per_page']);
    }
}
