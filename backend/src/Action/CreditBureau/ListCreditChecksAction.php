<?php
declare(strict_types=1);
namespace App\Action\CreditBureau;

use App\Domain\Repository\CreditCheckRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GET /api/credit-bureau/checks — paginated enquiry history.
 * Optional query: search (BVN / customer / app id), status.
 */
final class ListCreditChecksAction
{
    use ApiResponse;

    public function __construct(private readonly CreditCheckRepository $repo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $params = $request->getQueryParams();
        $p = $this->getPaginationParams($params);
        $result = $this->repo->findPaginated($p['offset'], $p['per_page'], $p['search'] ?: null, $params['status'] ?? null);
        return $this->paginated(array_map(fn($c) => $c->toArray(), $result['items']), $result['total'], $p['page'], $p['per_page']);
    }
}
