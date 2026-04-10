<?php

declare(strict_types=1);

namespace App\Action\User;

use App\Domain\Entity\User;
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

final class CreateUserAction
{
    use ApiResponse;

    public function __construct(
        private readonly UserRepository $userRepo,
        private readonly RoleRepository $roleRepo,
        private readonly LocationRepository $locationRepo,
        private readonly AuditService $auditService,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = (array) ($request->getParsedBody() ?? []);

        $validation = InputValidator::validate($data, [
            'first_name' => ['required' => true, 'type' => 'string', 'min' => 1, 'max' => 100],
            'last_name'  => ['required' => true, 'type' => 'string', 'min' => 1, 'max' => 100],
            'email'      => ['required' => true, 'type' => 'email'],
            'password'   => ['required' => true, 'type' => 'string', 'min' => 8, 'max' => 72],
            'phone'      => ['required' => false, 'type' => 'string', 'max' => 20],
            'role_ids'   => ['required' => true, 'type' => 'array'],
            'location_ids' => ['required' => false, 'type' => 'array', 'default' => []],
        ]);

        if (!empty($validation['errors'])) {
            return $this->validationError($validation['errors']);
        }

        $clean = $validation['clean'];

        // Check email uniqueness
        if ($this->userRepo->emailExists($clean['email'])) {
            return $this->validationError(['email' => 'Email address is already in use']);
        }

        // Validate password strength
        $pwErrors = PasswordService::validate($clean['password']);
        if (!empty($pwErrors)) {
            return $this->validationError(['password' => implode('. ', $pwErrors)]);
        }

        $user = new User();
        $user->setFirstName($clean['first_name']);
        $user->setLastName($clean['last_name']);
        $user->setEmail($clean['email']);
        $user->setPasswordHash(PasswordService::hash($clean['password']));
        $user->setPhone($clean['phone'] ?? null);
        $user->setStatus(UserStatus::ACTIVE);

        // Assign roles
        foreach ($clean['role_ids'] as $roleId) {
            $role = $this->roleRepo->find($roleId);
            if ($role !== null) {
                $user->addRole($role);
            }
        }

        // Assign locations
        foreach ($clean['location_ids'] as $locId) {
            $loc = $this->locationRepo->find($locId);
            if ($loc !== null) {
                $user->addLocation($loc);
            }
        }

        $this->userRepo->save($user);

        $this->auditService->logCreate(
            $request->getAttribute('user_id'),
            'User', $user->getId(),
            $user->toArray(),
            $this->getClientIp($request), $this->getUserAgent($request)
        );

        return $this->created($user->toArray(true), 'User created successfully');
    }
}
