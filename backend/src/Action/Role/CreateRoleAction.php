<?php
declare(strict_types=1);
namespace App\Action\Role;

use App\Domain\Entity\Role;
use App\Domain\Repository\{PermissionRepository, RoleRepository};
use App\Infrastructure\Service\{ApiResponse, AuditService, InputValidator};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class CreateRoleAction
{
    use ApiResponse;
    public function __construct(private readonly RoleRepository $roleRepo, private readonly PermissionRepository $permRepo, private readonly AuditService $audit) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = (array) ($request->getParsedBody() ?? []);
        $v = InputValidator::validate($data, [
            'name'           => ['required' => true, 'type' => 'string', 'min' => 1, 'max' => 100],
            'slug'           => ['required' => true, 'type' => 'string', 'min' => 1, 'max' => 100],
            'description'    => ['required' => false, 'type' => 'string', 'max' => 500],
            'permission_ids' => ['required' => false, 'type' => 'array', 'default' => []],
        ]);
        if (!empty($v['errors'])) return $this->validationError($v['errors']);

        if ($this->roleRepo->slugExists($v['clean']['slug'])) {
            return $this->validationError(['slug' => 'Role slug already exists']);
        }

        $role = new Role();
        $role->setName($v['clean']['name']);
        $role->setSlug($v['clean']['slug']);
        $role->setDescription($v['clean']['description'] ?? null);

        foreach (($v['clean']['permission_ids'] ?? []) as $permId) {
            $perm = $this->permRepo->find($permId);
            if ($perm !== null) $role->addPermission($perm);
        }

        $this->roleRepo->save($role);
        $this->audit->logCreate($request->getAttribute('user_id'), 'Role', $role->getId(), $role->toArray(true), $this->getClientIp($request), $this->getUserAgent($request));
        return $this->created($role->toArray(true), 'Role created successfully');
    }
}
