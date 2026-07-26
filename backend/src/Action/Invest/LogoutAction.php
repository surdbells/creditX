<?php

declare(strict_types=1);

namespace App\Action\Invest;

use App\Infrastructure\Service\{ApiResponse, JwtService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * POST /api/invest/auth/logout — end the investor session. The access token is
 * blacklisted for its remaining TTL and the refresh token (if supplied) is
 * invalidated.
 */
final class LogoutAction
{
    use ApiResponse;

    public function __construct(private readonly JwtService $jwtService) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $authHeader = $request->getHeaderLine('Authorization');
        $accessToken = str_starts_with($authHeader, 'Bearer ') ? substr($authHeader, 7) : '';
        $refreshToken = ((array) ($request->getParsedBody() ?? []))['refresh_token'] ?? '';

        $this->jwtService->revokeTokens($accessToken, $refreshToken);

        return $this->success(null, 'Signed out');
    }
}
