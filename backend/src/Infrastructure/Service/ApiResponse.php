<?php

declare(strict_types=1);

namespace App\Infrastructure\Service;

use Psr\Http\Message\ResponseInterface;
use Slim\Psr7\Response;

trait ApiResponse
{
    protected function json(array $data, int $status = 200): ResponseInterface
    {
        $response = new Response($status);
        $response->getBody()->write(json_encode($data, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE));
        return $response->withHeader('Content-Type', 'application/json');
    }

    protected function success(mixed $data = null, string $message = 'Success', int $status = 200): ResponseInterface
    {
        $payload = [
            'status'  => 'success',
            'message' => $message,
        ];
        if ($data !== null) {
            $payload['data'] = $data;
        }
        return $this->json($payload, $status);
    }

    protected function created(mixed $data = null, string $message = 'Created successfully'): ResponseInterface
    {
        return $this->success($data, $message, 201);
    }

    protected function paginated(array $items, int $total, int $page, int $perPage, string $message = 'Success'): ResponseInterface
    {
        return $this->json([
            'status'  => 'success',
            'message' => $message,
            'data'    => $items,
            'meta'    => [
                'total'        => $total,
                'page'         => $page,
                'per_page'     => $perPage,
                'total_pages'  => (int) ceil($total / max($perPage, 1)),
            ],
        ]);
    }

    protected function error(string $message, int $status = 400, ?array $errors = null): ResponseInterface
    {
        $payload = [
            'status'  => 'error',
            'message' => $message,
        ];
        if ($errors !== null) {
            $payload['errors'] = $errors;
        }
        return $this->json($payload, $status);
    }

    protected function notFound(string $message = 'Resource not found'): ResponseInterface
    {
        return $this->error($message, 404);
    }

    protected function forbidden(string $message = 'Access denied'): ResponseInterface
    {
        return $this->error($message, 403);
    }

    protected function unauthorized(string $message = 'Unauthorized'): ResponseInterface
    {
        return $this->error($message, 401);
    }

    protected function validationError(array $errors): ResponseInterface
    {
        return $this->error('Validation failed', 422, $errors);
    }

    /**
     * Extract common query params for listing endpoints.
     *
     * The default per-page value comes from the `general.pagination_default`
     * system setting (configurable via the Settings UI). Falls back to 20
     * if the setting isn't present or the bootstrap registrar wasn't
     * invoked (e.g. CLI scripts that use this trait outside of a request
     * lifecycle). The hard ceiling of 100 is intentional — even if an
     * admin sets pagination_default to 500, callers can't request more
     * than 100 per page to keep responses reasonable.
     */
    protected function getPaginationParams(array $queryParams): array
    {
        $page = max(1, (int) ($queryParams['page'] ?? 1));

        $defaultPerPage = 20;
        $settings = SettingsRegistry::get();
        if ($settings !== null) {
            $configured = $settings->getInt('general.pagination_default', 20);
            // Defensive clamp: keep within the 1..100 envelope so a bad
            // setting value can't 0-out responses or blow past the ceiling.
            $defaultPerPage = max(1, min(100, $configured));
        }

        $perPage = min(100, max(1, (int) ($queryParams['per_page'] ?? $defaultPerPage)));
        $search = trim($queryParams['search'] ?? '');
        $sortBy = trim($queryParams['sort_by'] ?? 'createdAt');
        $sortDir = strtoupper(trim($queryParams['sort_dir'] ?? 'DESC'));
        if (!in_array($sortDir, ['ASC', 'DESC'], true)) {
            $sortDir = 'DESC';
        }

        // Convert snake_case to camelCase for DQL (e.g. created_at → createdAt)
        if (str_contains($sortBy, '_')) {
            $sortBy = lcfirst(str_replace('_', '', ucwords($sortBy, '_')));
        }

        return [
            'page'     => $page,
            'per_page' => $perPage,
            'offset'   => ($page - 1) * $perPage,
            'search'   => $search,
            'sort_by'  => $sortBy,
            'sort_dir' => $sortDir,
        ];
    }

    /**
     * Get client IP from request.
     */
    protected function getClientIp(\Psr\Http\Message\ServerRequestInterface $request): string
    {
        $forwarded = $request->getHeaderLine('X-Forwarded-For');
        if ($forwarded !== '') {
            return trim(explode(',', $forwarded)[0]);
        }
        return $request->getServerParams()['REMOTE_ADDR'] ?? '127.0.0.1';
    }

    /**
     * Get user agent from request.
     */
    protected function getUserAgent(\Psr\Http\Message\ServerRequestInterface $request): string
    {
        return $request->getHeaderLine('User-Agent');
    }
}
