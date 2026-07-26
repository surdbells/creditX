<?php

declare(strict_types=1);

namespace App\Infrastructure\Middleware;

use App\Infrastructure\Service\{PostingContext, PostingContextRegistry};
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

/**
 * Publishes the authenticated caller — id, permissions, roles, IP, user agent —
 * into PostingContextRegistry so the posting services can enforce
 * accounting-date rules and write the §9 audit fields without every one of them
 * taking a PSR-7 request.
 *
 * Must run AFTER AuthMiddleware, which is what sets these attributes.
 *
 * The context is cleared on the way out. PHP-FPM reuses worker processes, and a
 * static left populated would leak one request's permissions into the next —
 * so the clear happens in a finally block, even if the handler throws.
 */
final class PostingContextMiddleware implements MiddlewareInterface
{
    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        PostingContextRegistry::set(PostingContext::forUser(
            $request->getAttribute('user_id'),
            (array) $request->getAttribute('user_permissions', []),
            (array) $request->getAttribute('user_roles', []),
            $this->clientIp($request),
            $request->getHeaderLine('User-Agent') ?: null,
        ));

        try {
            return $handler->handle($request);
        } finally {
            PostingContextRegistry::clear();
        }
    }

    private function clientIp(ServerRequestInterface $request): ?string
    {
        $forwarded = $request->getHeaderLine('X-Forwarded-For');
        if ($forwarded !== '') {
            return trim(explode(',', $forwarded)[0]);
        }
        return $request->getServerParams()['REMOTE_ADDR'] ?? null;
    }
}
