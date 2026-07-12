<?php
declare(strict_types=1);
namespace App\Action\Settlement;

use App\Domain\Repository\SettlementRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GET /api/settlements — paginated settlement queue for operations/admin.
 * Optional query: status, search (application id / customer name / account).
 */
final class ListSettlementsAction
{
    use ApiResponse;

    public function __construct(private readonly SettlementRepository $repo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $params = $request->getQueryParams();
        $p = $this->getPaginationParams($params);
        $result = $this->repo->findPaginated(
            $p['offset'],
            $p['per_page'],
            $params['status'] ?? null,
            $p['search'] ?: null,
        );
        $items = array_map(fn($s) => $s->toArray(), $result['items']);
        return $this->paginated($items, $result['total'], $p['page'], $p['per_page']);
    }
}
