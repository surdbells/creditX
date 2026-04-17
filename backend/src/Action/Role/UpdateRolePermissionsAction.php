<?php
declare(strict_types=1);
namespace App\Action\Role;

use App\Domain\Entity\{Role, Permission};
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class UpdateRolePermissionsAction
{
    use ApiResponse;
    public function __construct(private readonly EntityManagerInterface $em) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $role = $this->em->find(Role::class, $args['id'] ?? '');
        if (!$role) return $this->notFound('Role not found');

        $data = (array) ($request->getParsedBody() ?? []);
        $permissionIds = $data['permission_ids'] ?? [];

        // Clear existing permissions
        $role->clearPermissions();

        // Add new permissions
        foreach ($permissionIds as $pid) {
            $perm = $this->em->find(Permission::class, $pid);
            if ($perm) $role->addPermission($perm);
        }

        $this->em->flush();

        return $this->success($role->toArray(true), 'Permissions updated');
    }
}
