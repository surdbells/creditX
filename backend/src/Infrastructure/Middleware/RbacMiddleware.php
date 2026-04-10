<?php

declare(strict_types=1);

namespace App\Infrastructure\Middleware;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Slim\Psr7\Response;

/**
 * Check that the authenticated user has the required permission(s).
 * Must be applied AFTER AuthMiddleware.
 */
final class RbacMiddleware implements MiddlewareInterface
{
    /**
     * @param string|string[] $requiredPermissions One or more permission slugs
     * @param bool $requireAll If true, user must have ALL permissions; if false, ANY one suffices
     */
    public function __construct(
        private readonly string|array $requiredPermissions,
        private readonly bool $requireAll = false,
    ) {
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $userPermissions = $request->getAttribute('user_permissions', []);
        $userRoles = $request->getAttribute('user_roles', []);

        // Super admin bypasses all permission checks
        if (in_array('super_admin', $userRoles, true)) {
            return $handler->handle($request);
        }

        $required = is_string($this->requiredPermissions)
            ? [$this->requiredPermissions]
            : $this->requiredPermissions;

        if (empty($required)) {
            return $handler->handle($request);
        }

        $hasAccess = $this->requireAll
            ? $this->hasAll($userPermissions, $required)
            : $this->hasAny($userPermissions, $required);

        if (!$hasAccess) {
            $response = new Response(403);
            $response->getBody()->write(json_encode([
                'status'  => 'error',
                'message' => 'You do not have permission to perform this action',
            ]));
            return $response->withHeader('Content-Type', 'application/json');
        }

        return $handler->handle($request);
    }

    private function hasAny(array $userPermissions, array $required): bool
    {
        foreach ($required as $perm) {
            if (in_array($perm, $userPermissions, true)) {
                return true;
            }
        }
        return false;
    }

    private function hasAll(array $userPermissions, array $required): bool
    {
        foreach ($required as $perm) {
            if (!in_array($perm, $userPermissions, true)) {
                return false;
            }
        }
        return true;
    }
}
