<?php
declare(strict_types=1);
namespace App\Action\Role;

use App\Domain\Repository\PermissionRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class ListPermissionsAction
{
    use ApiResponse;
    public function __construct(private readonly PermissionRepository $repo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $grouped = $this->repo->allGroupedByModule();
        $result = [];
        foreach ($grouped as $module => $permissions) {
            $result[] = [
                'module' => $module,
                'permissions' => array_map(fn($p) => $p->toArray(), $permissions),
            ];
        }
        return $this->success($result);
    }
}
