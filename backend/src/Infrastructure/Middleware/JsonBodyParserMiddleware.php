<?php

declare(strict_types=1);

namespace App\Infrastructure\Middleware;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

final class JsonBodyParserMiddleware implements MiddlewareInterface
{
    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $contentType = $request->getHeaderLine('Content-Type');

        if (str_contains($contentType, 'application/json')) {
            $body = (string) $request->getBody();
            if ($body !== '') {
                $decoded = json_decode($body, true);
                if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                    $request = $request->withParsedBody($decoded);
                }
            }
        }

        return $handler->handle($request);
    }
}
