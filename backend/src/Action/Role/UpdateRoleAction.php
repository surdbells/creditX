<?php
declare(strict_types=1);
namespace App\Action\Role;

use App\Domain\Repository\{PermissionRepository, RoleRepository};
use App\Infrastructure\Service\{ApiResponse, AuditService, InputValidator};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class UpdateRoleAction
{
    use ApiResponse;
    public function __construct(private readonly RoleRepository $roleRepo, private readonly PermissionRepository $permRepo, private readonly AuditService $audit) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $role = $this->roleRepo->find($args['id'] ?? '');
        if ($role === null) return $this->notFound('Role not found');
        if ($role->isSystem()) return $this->error('System roles cannot be modified', 403);

        $old = $role->toArray(true);
        $data = (array) ($request->getParsedBody() ?? []);
        $v = InputValidator::validate($data, [
            'name'           => ['required' => false, 'type' => 'string', 'max' => 100],
            'description'    => ['required' => false, 'type' => 'string', 'max' => 500],
            'is_active'      => ['required' => false, 'type' => 'bool'],
            'permission_ids' => ['required' => false, 'type' => 'array'],
        ]);
        if (!empty($v['errors'])) return $this->validationError($v['errors']);
        $c = $v['clean'];

        if (isset($c['name']) && $c['name'] !== null) $role->setName($c['name']);
        if (array_key_exists('description', $c)) $role->setDescription($c['description']);
        if (isset($c['is_active'])) $role->setIsActive($c['is_active']);

        if (isset($c['permission_ids']) && is_array($c['permission_ids'])) {
            $role->clearPermissions();
            foreach ($c['permission_ids'] as $permId) {
                $perm = $this->permRepo->find($permId);
                if ($perm !== null) $role->addPermission($perm);
            }
        }

        $this->roleRepo->flush();
        $this->audit->logUpdate($request->getAttribute('user_id'), 'Role', $role->getId(), $old, $role->toArray(true), $this->getClientIp($request), $this->getUserAgent($request));
        return $this->success($role->toArray(true), 'Role updated successfully');
    }
}
