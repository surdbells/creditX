<?php

declare(strict_types=1);

namespace App\Action\Portal;

use App\Domain\Entity\Customer;
use App\Infrastructure\Service\JwtService;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Shared token issuance for the customer portal auth actions. Customers have
 * no roles or permissions, so those arrays are always empty; the access token
 * is tagged with scope='customer' so it is only ever accepted by
 * CustomerAuthMiddleware (and rejected by the staff AuthMiddleware).
 */
trait IssuesPortalTokens
{
    /**
     * @return array{access_token: string, refresh_token: string, expires_in: int}
     */
    private function issuePortalTokens(JwtService $jwtService, Customer $customer): array
    {
        return $jwtService->issueTokens(
            $customer->getId(),
            (string) $customer->getEmail(),
            [],
            [],
            ['scope' => 'customer'],
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
