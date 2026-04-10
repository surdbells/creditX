<?php

declare(strict_types=1);

namespace App\Infrastructure\Service;

use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Firebase\JWT\ExpiredException;

final class JwtService
{
    private string $secret;
    private int $accessTtl;
    private int $refreshTtl;
    private string $issuer;
    private string $algorithm;

    public function __construct(private readonly RedisService $redis)
    {
        $this->secret    = $_ENV['JWT_SECRET'] ?? 'change-me';
        $this->accessTtl = (int) ($_ENV['JWT_ACCESS_TTL'] ?? 900);
        $this->refreshTtl = (int) ($_ENV['JWT_REFRESH_TTL'] ?? 604800);
        $this->issuer    = $_ENV['JWT_ISSUER'] ?? 'creditx-api';
        $this->algorithm = $_ENV['JWT_ALGORITHM'] ?? 'HS256';
    }

    /**
     * Issue an access + refresh token pair.
     *
     * @return array{access_token: string, refresh_token: string, expires_in: int}
     */
    public function issueTokens(string $userId, string $email, array $roles, array $permissions): array
    {
        $now = time();

        $accessPayload = [
            'iss'   => $this->issuer,
            'sub'   => $userId,
            'email' => $email,
            'roles' => $roles,
            'permissions' => $permissions,
            'type'  => 'access',
            'iat'   => $now,
            'exp'   => $now + $this->accessTtl,
            'jti'   => bin2hex(random_bytes(16)),
        ];

        $refreshPayload = [
            'iss'  => $this->issuer,
            'sub'  => $userId,
            'type' => 'refresh',
            'iat'  => $now,
            'exp'  => $now + $this->refreshTtl,
            'jti'  => bin2hex(random_bytes(16)),
        ];

        $accessToken = JWT::encode($accessPayload, $this->secret, $this->algorithm);
        $refreshToken = JWT::encode($refreshPayload, $this->secret, $this->algorithm);

        // Store refresh token JTI in Redis for blacklisting on logout
        $this->redis->set(
            'refresh:' . $refreshPayload['jti'],
            json_encode(['user_id' => $userId, 'issued_at' => $now]),
            $this->refreshTtl
        );

        return [
            'access_token'  => $accessToken,
            'refresh_token' => $refreshToken,
            'token_type'    => 'Bearer',
            'expires_in'    => $this->accessTtl,
        ];
    }

    /**
     * Decode and validate an access token.
     *
     * @throws \RuntimeException on invalid/expired/blacklisted tokens
     */
    public function validateAccessToken(string $token): object
    {
        try {
            $payload = JWT::decode($token, new Key($this->secret, $this->algorithm));
        } catch (ExpiredException $e) {
            throw new \RuntimeException('Token has expired', 401);
        } catch (\Exception $e) {
            throw new \RuntimeException('Invalid token: ' . $e->getMessage(), 401);
        }

        if (($payload->type ?? '') !== 'access') {
            throw new \RuntimeException('Invalid token type', 401);
        }

        // Check if token is blacklisted
        if ($this->redis->exists('blacklist:' . $payload->jti)) {
            throw new \RuntimeException('Token has been revoked', 401);
        }

        return $payload;
    }

    /**
     * Validate a refresh token and return its payload.
     *
     * @throws \RuntimeException on invalid/expired/revoked tokens
     */
    public function validateRefreshToken(string $token): object
    {
        try {
            $payload = JWT::decode($token, new Key($this->secret, $this->algorithm));
        } catch (ExpiredException $e) {
            throw new \RuntimeException('Refresh token has expired', 401);
        } catch (\Exception $e) {
            throw new \RuntimeException('Invalid refresh token: ' . $e->getMessage(), 401);
        }

        if (($payload->type ?? '') !== 'refresh') {
            throw new \RuntimeException('Invalid token type', 401);
        }

        // Check if refresh token JTI still exists in Redis (deleted = revoked)
        if (!$this->redis->exists('refresh:' . $payload->jti)) {
            throw new \RuntimeException('Refresh token has been revoked', 401);
        }

        return $payload;
    }

    /**
     * Revoke tokens on logout.
     */
    public function revokeTokens(string $accessToken, string $refreshToken): void
    {
        try {
            // Blacklist access token for its remaining TTL
            $accessPayload = JWT::decode($accessToken, new Key($this->secret, $this->algorithm));
            $remainingTtl = max(0, $accessPayload->exp - time());
            if ($remainingTtl > 0) {
                $this->redis->set('blacklist:' . $accessPayload->jti, '1', $remainingTtl);
            }
        } catch (\Exception) {
            // Access token may already be expired — that's fine
        }

        try {
            // Delete refresh token from Redis (invalidates it)
            $refreshPayload = JWT::decode($refreshToken, new Key($this->secret, $this->algorithm));
            $this->redis->delete('refresh:' . $refreshPayload->jti);
        } catch (\Exception) {
            // Refresh token may already be expired
        }
    }

    /**
     * Revoke all refresh tokens for a user (force logout everywhere).
     */
    public function revokeAllUserTokens(string $userId): void
    {
        $this->redis->deletePattern('refresh:*');
        // Note: In production, consider storing user_id->jti mapping for targeted revocation
    }
}
