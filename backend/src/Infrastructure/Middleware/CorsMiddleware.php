<?php

declare(strict_types=1);

namespace App\Infrastructure\Middleware;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Slim\Psr7\Response;

final class CorsMiddleware implements MiddlewareInterface
{
    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $allowedOrigins = array_map('trim', explode(',', $_ENV['CORS_ALLOWED_ORIGINS'] ?? '*'));
        $origin = $request->getHeaderLine('Origin');

        $matchedOrigin = '';
        if (in_array('*', $allowedOrigins, true)) {
            $matchedOrigin = '*';
        } elseif (in_array($origin, $allowedOrigins, true)) {
            $matchedOrigin = $origin;
        }

        // Handle preflight
        if ($request->getMethod() === 'OPTIONS') {
            $response = new Response(204);
            return $this->addCorsHeaders($response, $matchedOrigin);
        }

        $response = $handler->handle($request);
        return $this->addCorsHeaders($response, $matchedOrigin);
    }

    private function addCorsHeaders(ResponseInterface $response, string $origin): ResponseInterface
    {
        if ($origin === '') {
            return $response;
        }

        return $response
            ->withHeader('Access-Control-Allow-Origin', $origin)
            ->withHeader('Access-Control-Allow-Methods', $_ENV['CORS_ALLOWED_METHODS'] ?? 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
            ->withHeader('Access-Control-Allow-Headers', $_ENV['CORS_ALLOWED_HEADERS'] ?? 'Content-Type,Authorization,X-Requested-With')
            ->withHeader('Access-Control-Allow-Credentials', 'true')
            ->withHeader('Access-Control-Max-Age', '86400');
    }
}
