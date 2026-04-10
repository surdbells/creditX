<?php

declare(strict_types=1);

use DI\ContainerBuilder;
use Slim\Factory\AppFactory;

require __DIR__ . '/../vendor/autoload.php';

// Load environment variables
$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
$dotenv->load();

// Build DI container
$containerBuilder = new ContainerBuilder();
$containerBuilder->addDefinitions(__DIR__ . '/../config/container.php');

if ($_ENV['APP_ENV'] === 'production') {
    $containerBuilder->enableCompilation(__DIR__ . '/../var/cache');
    $containerBuilder->writeProxiesToFile(true, __DIR__ . '/../var/proxies');
}

$container = $containerBuilder->build();

// Create Slim app from container
AppFactory::setContainer($container);
$app = AppFactory::create();

// Register middleware
(require __DIR__ . '/../config/middleware.php')($app);

// Register routes
(require __DIR__ . '/../config/routes.php')($app);

$app->run();
