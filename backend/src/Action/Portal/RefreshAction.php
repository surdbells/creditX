<?php

declare(strict_types=1);

namespace App\Action\Portal;

use App\Domain\Enum\CustomerPortalStatus;
use App\Domain\Repository\CustomerRepository;
use App\Infrastructure\Service\{ApiResponse, JwtService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Exchange a valid portal refresh token for a new access + refresh pair.
 * The old refresh token is revoked (rotation). The reissued access token
 * keeps the scope='customer' tag.
 */
final class RefreshAction
{
    use ApiResponse;
    use IssuesPortalTokens;

    public function __construct(
        private readonly JwtService $jwtService,
        private readonly CustomerRepository $customerRepo,
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

        $customer = $this->customerRepo->find($payload->sub);

        if ($customer === null
            || !$customer->isPortalEnabled()
            || $customer->getPortalStatus() !== CustomerPortalStatus::ACTIVE
        ) {
            return $this->error('Account is no longer active', 401);
        }

        // Rotate: revoke the presented refresh token before issuing a new pair.
        $this->jwtService->revokeTokens('', $refreshToken);

        return $this->success([
            'customer' => $customer->toArray(),
            'tokens'   => $this->issuePortalTokens($this->jwtService, $customer),
        ], 'Token refreshed');
    }
}
