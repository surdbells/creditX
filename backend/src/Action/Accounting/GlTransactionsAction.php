<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Domain\Repository\LedgerTransactionRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class GlTransactionsAction
{
    use ApiResponse;
    public function __construct(private readonly LedgerTransactionRepository $repo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $glId = $args['id'] ?? '';
        $params = $request->getQueryParams();
        $p = $this->getPaginationParams($params);

        $result = $this->repo->paginatedByGl($glId, $p['offset'], $p['per_page'], $params['year'] ?? null, $params['month'] ?? null, $params['day'] ?? null);
        $items = array_map(fn($t) => $t->toArray(), $result['items']);

        // Also include summary
        $summary = $this->repo->getGlSum($glId, $params['year'] ?? null, $params['month'] ?? null, $params['day'] ?? null);

        return $this->json([
            'status' => 'success', 'message' => 'Success',
            'data' => $items, 'summary' => $summary,
            'meta' => ['total' => $result['total'], 'page' => $p['page'], 'per_page' => $p['per_page'], 'total_pages' => (int) ceil($result['total'] / max($p['per_page'], 1))],
        ]);
    }
}
