<?php

declare(strict_types=1);

namespace App\Action\Auth;

use App\Domain\Enum\UserStatus;
use App\Domain\Repository\UserRepository;
use App\Infrastructure\Service\ApiResponse;
use App\Infrastructure\Service\AuditService;
use App\Infrastructure\Service\InputValidator;
use App\Infrastructure\Service\JwtService;
use App\Infrastructure\Service\PasswordService;
use App\Domain\Enum\AuditAction;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

final class LoginAction
{
    use ApiResponse;

    public function __construct(
        private readonly UserRepository $userRepo,
        private readonly JwtService $jwtService,
        private readonly AuditService $auditService,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = (array) ($request->getParsedBody() ?? []);

        $validation = InputValidator::validate($data, [
            'email'    => ['required' => true, 'type' => 'email'],
            'password' => ['required' => true, 'type' => 'string', 'min' => 1],
        ]);

        if (!empty($validation['errors'])) {
            return $this->validationError($validation['errors']);
        }

        $user = $this->userRepo->findByEmail($validation['clean']['email']);

        if ($user === null || !PasswordService::verify($validation['clean']['password'], $user->getPasswordHash())) {
            return $this->error('Invalid email or password', 401);
        }

        if ($user->getStatus() !== UserStatus::ACTIVE) {
            return $this->error('Your account is ' . $user->getStatus()->value . '. Contact administrator.', 403);
        }

        // Issue tokens
        $roles = $user->getRoles()->map(fn($r) => $r->getSlug())->toArray();
        $permissions = $user->getAllPermissionSlugs();

        $tokens = $this->jwtService->issueTokens(
            $user->getId(),
            $user->getEmail(),
            array_values($roles),
            $permissions,
        );

        // Record login
        $ip = $this->getClientIp($request);
        $user->recordLogin($ip);
        $this->userRepo->flush();

        // Audit
        $this->auditService->log(
            $user->getId(), 'User', $user->getId(), AuditAction::LOGIN,
            null, null, $ip, $this->getUserAgent($request)
        );

        return $this->success([
            'user'   => $user->toArray(true),
            'tokens' => $tokens,
        ], 'Login successful');
    }
}
