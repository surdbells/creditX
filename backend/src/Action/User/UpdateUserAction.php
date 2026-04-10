<?php

declare(strict_types=1);

namespace App\Action\User;

use App\Domain\Enum\AuditAction;
use App\Domain\Enum\UserStatus;
use App\Domain\Repository\LocationRepository;
use App\Domain\Repository\RoleRepository;
use App\Domain\Repository\UserRepository;
use App\Infrastructure\Service\ApiResponse;
use App\Infrastructure\Service\AuditService;
use App\Infrastructure\Service\InputValidator;
use App\Infrastructure\Service\PasswordService;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

final class UpdateUserAction
{
    use ApiResponse;

    public function __construct(
        private readonly UserRepository $userRepo,
        private readonly RoleRepository $roleRepo,
        private readonly LocationRepository $locationRepo,
        private readonly AuditService $auditService,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $user = $this->userRepo->find($args['id'] ?? '');
        if ($user === null) {
            return $this->notFound('User not found');
        }

        $data = (array) ($request->getParsedBody() ?? []);
        $oldValues = $user->toArray();

        $validation = InputValidator::validate($data, [
            'first_name'   => ['required' => false, 'type' => 'string', 'max' => 100],
            'last_name'    => ['required' => false, 'type' => 'string', 'max' => 100],
            'email'        => ['required' => false, 'type' => 'email'],
            'phone'        => ['required' => false, 'type' => 'string', 'max' => 20],
            'status'       => ['required' => false, 'type' => 'string', 'in' => array_column(UserStatus::cases(), 'value')],
            'password'     => ['required' => false, 'type' => 'string', 'min' => 8, 'max' => 72],
            'role_ids'     => ['required' => false, 'type' => 'array'],
            'location_ids' => ['required' => false, 'type' => 'array'],
        ]);

        if (!empty($validation['errors'])) {
            return $this->validationError($validation['errors']);
        }

        $clean = $validation['clean'];

        // Email uniqueness check
        if (isset($clean['email']) && $clean['email'] !== null) {
            if ($this->userRepo->emailExists($clean['email'], $user->getId())) {
                return $this->validationError(['email' => 'Email address is already in use']);
            }
            $user->setEmail($clean['email']);
        }

        if (isset($clean['first_name']) && $clean['first_name'] !== null) {
            $user->setFirstName($clean['first_name']);
        }
        if (isset($clean['last_name']) && $clean['last_name'] !== null) {
            $user->setLastName($clean['last_name']);
        }
        if (isset($clean['phone'])) {
            $user->setPhone($clean['phone']);
        }
        if (isset($clean['status']) && $clean['status'] !== null) {
            $user->setStatus(UserStatus::from($clean['status']));
        }

        // Password update
        if (isset($clean['password']) && $clean['password'] !== null) {
            $pwErrors = PasswordService::validate($clean['password']);
            if (!empty($pwErrors)) {
                return $this->validationError(['password' => implode('. ', $pwErrors)]);
            }
            $user->setPasswordHash(PasswordService::hash($clean['password']));
        }

        // Roles reassignment
        if (isset($clean['role_ids']) && is_array($clean['role_ids'])) {
            // Clear existing and reassign
            foreach ($user->getRoles()->toArray() as $existingRole) {
                $user->removeRole($existingRole);
            }
            foreach ($clean['role_ids'] as $roleId) {
                $role = $this->roleRepo->find($roleId);
                if ($role !== null) {
                    $user->addRole($role);
                }
            }
        }

        // Locations reassignment
        if (isset($clean['location_ids']) && is_array($clean['location_ids'])) {
            $user->clearLocations();
            foreach ($clean['location_ids'] as $locId) {
                $loc = $this->locationRepo->find($locId);
                if ($loc !== null) {
                    $user->addLocation($loc);
                }
            }
        }

        $this->userRepo->flush();

        $this->auditService->logUpdate(
            $request->getAttribute('user_id'),
            'User', $user->getId(),
            $oldValues, $user->toArray(),
            $this->getClientIp($request), $this->getUserAgent($request)
        );

        return $this->success($user->toArray(true), 'User updated successfully');
    }
}
