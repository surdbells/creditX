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
 * Guards the investor portal — a separate app from customer self-service.
 *
 * Requires scope='investor', a scope only issued by the /api/invest auth
 * actions after confirming the customer is flagged as an investor. A staff
 * token, or a customer-portal token belonging to the same person, is rejected
 * here; likewise an investor token cannot reach /api/portal or staff routes.
 * The two audiences therefore stay separated at the token layer, not merely in
 * the UI.
 *
 * The authenticated id is attached as BOTH 'customer_id' (investors are
 * Customer records, so ownership checks read the same attribute the portal
 * actions use) and 'investor_id' for clarity at call sites.
 */
final class InvestorAuthMiddleware implements MiddlewareInterface
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

        try {
            $payload = $this->jwtService->validateAccessToken(substr($authHeader, 7));
        } catch (\RuntimeException $e) {
            return $this->unauthorized($e->getMessage());
        }

        if (($payload->scope ?? null) !== 'investor') {
            return $this->unauthorized('This token is not valid for investor endpoints');
        }

        $request = $request
            ->withAttribute('customer_id', $payload->sub)
            ->withAttribute('investor_id', $payload->sub)
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
