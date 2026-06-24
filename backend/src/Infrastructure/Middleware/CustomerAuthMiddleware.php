<?php

declare(strict_types=1);

namespace App\Infrastructure\Middleware;

use App\Infrastructure\Service\JwtService;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Slim\Psr7\Response;

/**
 * Guards the customer self-service portal endpoints. Mirrors the staff
 * AuthMiddleware but requires the access token to carry scope='customer',
 * so a staff token can never reach a customer-scoped route (and vice
 * versa — staff routes reject scope='customer'). The authenticated
 * customer id is attached as 'customer_id' for downstream ownership checks.
 */
final class CustomerAuthMiddleware implements MiddlewareInterface
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

        if (($payload->scope ?? null) !== 'customer') {
            return $this->unauthorized('This token is not valid for portal endpoints');
        }

        $request = $request
            ->withAttribute('customer_id', $payload->sub)
            ->withAttribute('customer_email', $payload->email ?? '')
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
