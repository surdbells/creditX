<?php

declare(strict_types=1);

namespace App\Action\Invest;

use App\Domain\Entity\Customer;
use App\Domain\Enum\CustomerPortalStatus;
use App\Infrastructure\Service\JwtService;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Shared token issuance and eligibility checks for the investor portal.
 *
 * Tokens carry scope='investor', which only InvestorAuthMiddleware accepts —
 * so an investor token cannot reach customer-portal or staff routes, and a
 * customer-portal token belonging to the same person cannot reach investor
 * routes.
 */
trait IssuesInvestorTokens
{
    /**
     * @return array{access_token: string, refresh_token: string, expires_in: int}
     */
    private function issueInvestorTokens(JwtService $jwtService, Customer $customer): array
    {
        return $jwtService->issueTokens(
            $customer->getId(),
            (string) $customer->getEmail(),
            [],
            [],
            ['scope' => 'investor'],
        );
    }

    /**
     * May this customer sign in to the investor portal?
     *
     * Investor access is granted by staff — there is no self-registration — so
     * is_investor IS the gate, and revoking it is how access is withdrawn.
     *
     * Deliberately NOT requiring portalStatus === ACTIVE: that status tracks
     * customer self-service registration, and an investor onboarded by staff
     * has never been through it (their status is null). Requiring it would lock
     * out exactly the people this portal is for. A status that represents a
     * genuine bar — SUSPENDED or REJECTED — is still honoured, so barring
     * someone from self-service also bars them here.
     */
    private function canSignIn(?Customer $customer): bool
    {
        if ($customer === null || !$customer->isInvestor()) {
            return false;
        }
        return !in_array(
            $customer->getPortalStatus(),
            [CustomerPortalStatus::SUSPENDED, CustomerPortalStatus::REJECTED],
            true,
        );
    }

    private function clientIp(ServerRequestInterface $request): string
    {
        $forwarded = $request->getHeaderLine('X-Forwarded-For');
        if ($forwarded !== '') {
            return trim(explode(',', $forwarded)[0]);
        }
        return $request->getServerParams()['REMOTE_ADDR'] ?? '127.0.0.1';
    }
}
