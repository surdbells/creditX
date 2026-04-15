<?php

declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

if (file_exists(__DIR__ . '/../.env')) {
    $dotenv = \Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
    $dotenv->load();
}

$container = require __DIR__ . '/../config/container.php';

// Build the DI container
$builder = new \DI\ContainerBuilder();
$builder->addDefinitions($container);
$dic = $builder->build();

$overdueService = $dic->get(\App\Infrastructure\Service\OverdueService::class);

echo "[" . date('Y-m-d H:i:s') . "] Running overdue detection...\n";

try {
    $result = $overdueService->processOverdue();
    echo "  Overdue loans: {$result['overdue_loans']}\n";
    echo "  Penalties applied: {$result['penalties_applied']}\n";
    echo "  Done.\n";
} catch (\Exception $e) {
    echo "  ERROR: " . $e->getMessage() . "\n";
    exit(1);
}
