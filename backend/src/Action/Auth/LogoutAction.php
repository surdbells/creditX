<?php

declare(strict_types=1);

namespace App\Action\Auth;

use App\Infrastructure\Service\ApiResponse;
use App\Infrastructure\Service\AuditService;
use App\Infrastructure\Service\JwtService;
use App\Domain\Enum\AuditAction;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

final class LogoutAction
{
    use ApiResponse;

    public function __construct(
        private readonly JwtService $jwtService,
        private readonly AuditService $auditService,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = (array) ($request->getParsedBody() ?? []);
        $accessToken = substr($request->getHeaderLine('Authorization'), 7);
        $refreshToken = $data['refresh_token'] ?? '';

        if ($accessToken !== '' || $refreshToken !== '') {
            $this->jwtService->revokeTokens($accessToken, $refreshToken);
        }

        $userId = $request->getAttribute('user_id');
        $this->auditService->log(
            $userId, 'User', $userId ?? '', AuditAction::LOGOUT,
            null, null, $this->getClientIp($request), $this->getUserAgent($request)
        );

        return $this->success(null, 'Logged out successfully');
    }
}
