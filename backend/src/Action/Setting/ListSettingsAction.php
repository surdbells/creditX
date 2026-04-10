<?php
declare(strict_types=1);
namespace App\Action\Setting;

use App\Domain\Repository\SystemSettingRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class ListSettingsAction
{
    use ApiResponse;
    public function __construct(private readonly SystemSettingRepository $repo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $params = $request->getQueryParams();
        $pagination = $this->getPaginationParams($params);
        $result = $this->repo->paginated($pagination['offset'], $pagination['per_page'], $pagination['sort_by'], $pagination['sort_dir'], $pagination['search'] ?: null, $params['category'] ?? null);
        $items = array_map(fn($s) => $s->toArray(), $result['items']);
        return $this->paginated($items, $result['total'], $pagination['page'], $pagination['per_page']);
    }
}
