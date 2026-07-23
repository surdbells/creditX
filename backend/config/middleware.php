<?php

declare(strict_types=1);

use App\Infrastructure\Middleware\CorsMiddleware;
use App\Infrastructure\Middleware\JsonBodyParserMiddleware;
use App\Infrastructure\Middleware\RateLimitMiddleware;
use Slim\App;

return function (App $app): void {
    // Rate limiting
    $app->add(new RateLimitMiddleware(
        $app->getContainer()->get(\App\Infrastructure\Service\RedisService::class),
        (int) ($_ENV['RATE_LIMIT_REQUESTS'] ?? 60),
        (int) ($_ENV['RATE_LIMIT_WINDOW'] ?? 60)
    ));

    // Parse JSON request bodies
    $app->add(new JsonBodyParserMiddleware());

    // Routing (must be BEFORE CORS in registration = runs AFTER CORS in pipeline)
    $app->addRoutingMiddleware();

    // Error handling — added AFTER routing so it catches route errors
    $errorMiddleware = $app->addErrorMiddleware(
        (bool) ($_ENV['APP_DEBUG'] ?? false),
        true,
        true,
        $app->getContainer()->get(\Psr\Log\LoggerInterface::class)
    );

    // Custom error handler that adds CORS headers to error responses
    $errorMiddleware->setDefaultErrorHandler(function (
        \Psr\Http\Message\ServerRequestInterface $request,
        \Throwable $exception,
        bool $displayErrorDetails,
        bool $logErrors,
        bool $logErrorDetails,
    ) use ($app) {
        $statusCode = 500;
        if ($exception instanceof \Slim\Exception\HttpException) {
            $statusCode = $exception->getCode();
        }

        // Report server-side failures to Sentry — not client 4xx (validation,
        // not-found, unauthorized), which are expected and would be noise.
        if ($statusCode >= 500 && function_exists('Sentry\\captureException')) {
            \Sentry\captureException($exception);
        }

        $payload = ['status' => 'error', 'message' => 'Internal server error'];
        if ($displayErrorDetails) {
            $payload['message'] = $exception->getMessage();
            $payload['trace'] = $exception->getTraceAsString();
        }

        $response = $app->getResponseFactory()->createResponse($statusCode);
        $response->getBody()->write(json_encode($payload));

        $origin = $request->getHeaderLine('Origin');
        $allowedOrigins = array_map('trim', explode(',', $_ENV['CORS_ALLOWED_ORIGINS'] ?? '*'));
        $matchedOrigin = in_array('*', $allowedOrigins) ? '*' : (in_array($origin, $allowedOrigins) ? $origin : '');

        if ($matchedOrigin) {
            $response = $response
                ->withHeader('Access-Control-Allow-Origin', $matchedOrigin)
                ->withHeader('Access-Control-Allow-Methods', $_ENV['CORS_ALLOWED_METHODS'] ?? 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
                ->withHeader('Access-Control-Allow-Headers', $_ENV['CORS_ALLOWED_HEADERS'] ?? 'Content-Type,Authorization,X-Requested-With')
                ->withHeader('Access-Control-Allow-Credentials', 'true');
        }

        return $response->withHeader('Content-Type', 'application/json');
    });

    // CORS — added LAST = runs FIRST in Slim's LIFO middleware pipeline
    $app->add(new CorsMiddleware());
};
