<?php

declare(strict_types=1);

use DI\ContainerBuilder;
use Slim\Factory\AppFactory;

require __DIR__ . '/../vendor/autoload.php';

// Load environment variables
$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
$dotenv->load();

// Build DI container (no compilation — Doctrine handles its own caching)
$containerBuilder = new ContainerBuilder();
$containerBuilder->addDefinitions(__DIR__ . '/../config/container.php');
$container = $containerBuilder->build();

// Register the settings cache as a static handle so the ApiResponse trait
// (and any other code path that can't easily inject it) can read system
// settings like the pagination default. Done once per request; the
// SettingsCacheService itself caches reads in Redis.
\App\Infrastructure\Service\SettingsRegistry::set(
    $container->get(\App\Infrastructure\Service\SettingsCacheService::class)
);

// Create Slim app from container
AppFactory::setContainer($container);
$app = AppFactory::create();

// Register middleware
(require __DIR__ . '/../config/middleware.php')($app);

// Register routes
(require __DIR__ . '/../config/routes.php')($app);

$app->run();
