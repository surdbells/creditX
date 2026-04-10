<?php
declare(strict_types=1);
namespace App\Action\RecordType;

use App\Domain\Repository\RecordTypeRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class ListRecordTypesAction
{
    use ApiResponse;
    public function __construct(private readonly RecordTypeRepository $repo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $params = $request->getQueryParams();
        $p = $this->getPaginationParams($params);
        $result = $this->repo->paginated($p['offset'], $p['per_page'], $p['sort_by'], $p['sort_dir'], $p['search'] ?: null, isset($params['is_active']) ? filter_var($params['is_active'], FILTER_VALIDATE_BOOLEAN) : null);
        return $this->paginated(array_map(fn($r) => $r->toArray(), $result['items']), $result['total'], $p['page'], $p['per_page']);
    }
}
