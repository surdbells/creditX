<?php

declare(strict_types=1);

use App\Infrastructure\Middleware\CorsMiddleware;
use App\Infrastructure\Middleware\JsonBodyParserMiddleware;
use App\Infrastructure\Middleware\RateLimitMiddleware;
use Slim\App;

return function (App $app): void {
    // Error handling (outermost — catches all errors)
    $app->addErrorMiddleware(
        (bool) ($_ENV['APP_DEBUG'] ?? false),
        true,
        true,
        $app->getContainer()->get(\Psr\Log\LoggerInterface::class)
    );

    // CORS (must be before routing to handle preflight)
    $app->add(new CorsMiddleware());

    // Parse JSON request bodies
    $app->add(new JsonBodyParserMiddleware());

    // Rate limiting
    $app->add(new RateLimitMiddleware(
        $app->getContainer()->get(\App\Infrastructure\Service\RedisService::class),
        (int) ($_ENV['RATE_LIMIT_REQUESTS'] ?? 60),
        (int) ($_ENV['RATE_LIMIT_WINDOW'] ?? 60)
    ));

    // Routing
    $app->addRoutingMiddleware();
};
