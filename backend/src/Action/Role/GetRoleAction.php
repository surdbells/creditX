<?php
declare(strict_types=1);
namespace App\Action\Role;

use App\Domain\Repository\RoleRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class GetRoleAction
{
    use ApiResponse;
    public function __construct(private readonly RoleRepository $repo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $role = $this->repo->find($args['id'] ?? '');
        if ($role === null) return $this->notFound('Role not found');
        return $this->success($role->toArray(true));
    }
}
