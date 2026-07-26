<?php

declare(strict_types=1);

namespace App\Action\Invest;

use App\Domain\Repository\CustomerRepository;
use App\Infrastructure\Service\{ApiResponse, JwtService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * POST /api/invest/auth/refresh — exchange an investor refresh token for a new
 * pair. The presented token is revoked (rotation) and the reissued access token
 * keeps scope='investor'.
 *
 * Re-checks eligibility on every refresh, so revoking someone's investor access
 * ends their session at the next rotation rather than at token expiry.
 */
final class RefreshAction
{
    use ApiResponse;
    use IssuesInvestorTokens;

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
        if (!$this->canSignIn($customer)) {
            return $this->error('Investor access is no longer active', 401);
        }

        $this->jwtService->revokeTokens('', $refreshToken);

        return $this->success([
            'investor' => $customer->toArray(),
            'tokens'   => $this->issueInvestorTokens($this->jwtService, $customer),
        ], 'Token refreshed');
    }
}
