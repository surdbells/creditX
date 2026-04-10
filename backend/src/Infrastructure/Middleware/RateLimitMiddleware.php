<?php

declare(strict_types=1);

namespace App\Infrastructure\Middleware;

use App\Infrastructure\Service\RedisService;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Slim\Psr7\Response;

final class RateLimitMiddleware implements MiddlewareInterface
{
    public function __construct(
        private readonly RedisService $redis,
        private readonly int $maxRequests = 60,
        private readonly int $windowSeconds = 60,
    ) {
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        // Skip rate limiting for OPTIONS (preflight)
        if ($request->getMethod() === 'OPTIONS') {
            return $handler->handle($request);
        }

        $ip = $this->getClientIp($request);
        $key = 'ratelimit:' . $ip;

        $current = $this->redis->increment($key);

        // Set expiry on first request in window
        if ($current === 1) {
            $this->redis->expire($key, $this->windowSeconds);
        }

        $remaining = max(0, $this->maxRequests - $current);
        $ttl = $this->redis->ttl($key);

        if ($current > $this->maxRequests) {
            $response = new Response(429);
            $response->getBody()->write(json_encode([
                'status'  => 'error',
                'message' => 'Too many requests. Please try again later.',
                'retry_after' => $ttl,
            ]));
            return $response
                ->withHeader('Content-Type', 'application/json')
                ->withHeader('X-RateLimit-Limit', (string) $this->maxRequests)
                ->withHeader('X-RateLimit-Remaining', '0')
                ->withHeader('X-RateLimit-Reset', (string) (time() + $ttl))
                ->withHeader('Retry-After', (string) $ttl);
        }

        $response = $handler->handle($request);
        return $response
            ->withHeader('X-RateLimit-Limit', (string) $this->maxRequests)
            ->withHeader('X-RateLimit-Remaining', (string) $remaining)
            ->withHeader('X-RateLimit-Reset', (string) (time() + $ttl));
    }

    private function getClientIp(ServerRequestInterface $request): string
    {
        $serverParams = $request->getServerParams();

        // Check forwarded headers (reverse proxy)
        $forwarded = $request->getHeaderLine('X-Forwarded-For');
        if ($forwarded !== '') {
            $ips = array_map('trim', explode(',', $forwarded));
            return $ips[0];
        }

        return $serverParams['REMOTE_ADDR'] ?? '127.0.0.1';
    }
}
