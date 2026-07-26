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

// Scheduled job: declare a trusted system actor so accounting-date rules
// allow the dates this job computes for itself (period ends, maturity dates)
// rather than treating them as an unauthenticated backdating attempt.
\App\Infrastructure\Service\PostingContextRegistry::setSystem(basename(__FILE__));

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
