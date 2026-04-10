<?php

declare(strict_types=1);

namespace App\Action\Auth;

use App\Domain\Enum\UserStatus;
use App\Domain\Repository\UserRepository;
use App\Infrastructure\Service\ApiResponse;
use App\Infrastructure\Service\JwtService;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

final class RefreshTokenAction
{
    use ApiResponse;

    public function __construct(
        private readonly JwtService $jwtService,
        private readonly UserRepository $userRepo,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = (array) ($request->getParsedBody() ?? []);
        $refreshToken = $data['refresh_token'] ?? '';

        if ($refreshToken === '') {
            return $this->error('Refresh token is required', 400);
        }

        try {
            $payload = $this->jwtService->validateRefreshToken($refreshToken);
        } catch (\RuntimeException $e) {
            return $this->error($e->getMessage(), 401);
        }

        // Load user to get fresh roles/permissions
        $user = $this->userRepo->find($payload->sub);

        if ($user === null || $user->getStatus() !== UserStatus::ACTIVE) {
            return $this->error('User account is no longer active', 401);
        }

        $roles = $user->getRoles()->map(fn($r) => $r->getSlug())->toArray();
        $permissions = $user->getAllPermissionSlugs();

        // Revoke old refresh token
        $this->jwtService->revokeTokens('', $refreshToken);

        // Issue new pair
        $tokens = $this->jwtService->issueTokens(
            $user->getId(),
            $user->getEmail(),
            array_values($roles),
            $permissions,
        );

        return $this->success([
            'user'   => $user->toArray(true),
            'tokens' => $tokens,
        ], 'Token refreshed');
    }
}
