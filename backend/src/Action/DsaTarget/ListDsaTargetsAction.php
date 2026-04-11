<?php
declare(strict_types=1);
namespace App\Action\DsaTarget;

use App\Domain\Repository\DsaTargetRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class ListDsaTargetsAction
{
    use ApiResponse;
    public function __construct(private readonly DsaTargetRepository $repo) {}
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $params = $request->getQueryParams();
        $p = $this->getPaginationParams($params);
        $result = $this->repo->paginated($p['offset'], $p['per_page'], $p['sort_by'], $p['sort_dir'], $params['user_id'] ?? null, $params['year'] ?? null);
        $items = array_map(fn($d) => $d->toArray(), $result['items']);
        return $this->paginated($items, $result['total'], $p['page'], $p['per_page']);
    }
}
