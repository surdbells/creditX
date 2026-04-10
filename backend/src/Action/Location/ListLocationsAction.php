<?php
declare(strict_types=1);
namespace App\Action\Location;

use App\Domain\Repository\LocationRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class ListLocationsAction
{
    use ApiResponse;
    public function __construct(private readonly LocationRepository $repo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $params = $request->getQueryParams();
        $pagination = $this->getPaginationParams($params);
        $result = $this->repo->paginated(
            $pagination['offset'], $pagination['per_page'], $pagination['sort_by'], $pagination['sort_dir'],
            $pagination['search'] ?: null, $params['type'] ?? null,
            isset($params['is_active']) ? filter_var($params['is_active'], FILTER_VALIDATE_BOOLEAN) : null,
        );
        $items = array_map(fn($l) => $l->toArray(), $result['items']);
        return $this->paginated($items, $result['total'], $pagination['page'], $pagination['per_page']);
    }
}
