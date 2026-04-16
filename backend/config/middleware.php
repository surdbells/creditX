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

    // CORS — added LAST = runs FIRST in Slim's LIFO middleware pipeline
    // This ensures OPTIONS preflight requests get CORS headers BEFORE
    // the router can reject them as 405 Method Not Allowed
    $app->add(new CorsMiddleware());
};
