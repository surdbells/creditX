<?php

declare(strict_types=1);

namespace App\Infrastructure\Middleware;

use App\Infrastructure\Service\JwtService;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Slim\Psr7\Response;

final class AuthMiddleware implements MiddlewareInterface
{
    public function __construct(
        private readonly JwtService $jwtService,
    ) {
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $authHeader = $request->getHeaderLine('Authorization');

        if ($authHeader === '' || !str_starts_with($authHeader, 'Bearer ')) {
            return $this->unauthorized('Missing or invalid Authorization header');
        }

        $token = substr($authHeader, 7);

        try {
            $payload = $this->jwtService->validateAccessToken($token);
        } catch (\RuntimeException $e) {
            return $this->unauthorized($e->getMessage());
        }

        // Attach user data to request attributes
        $request = $request
            ->withAttribute('user_id', $payload->sub)
            ->withAttribute('user_email', $payload->email ?? '')
            ->withAttribute('user_roles', $payload->roles ?? [])
            ->withAttribute('user_permissions', $payload->permissions ?? [])
            ->withAttribute('jwt_payload', $payload);

        return $handler->handle($request);
    }

    private function unauthorized(string $message): ResponseInterface
    {
        $response = new Response(401);
        $response->getBody()->write(json_encode([
            'status'  => 'error',
            'message' => $message,
        ]));
        return $response->withHeader('Content-Type', 'application/json');
    }
}
