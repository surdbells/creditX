<?php

declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

if (file_exists(__DIR__ . '/../.env')) {
    $dotenv = \Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
    $dotenv->load();
}

$container = require __DIR__ . '/../config/container.php';

$builder = new \DI\ContainerBuilder();
$builder->addDefinitions($container);
$dic = $builder->build();

$approvalEngine = $dic->get(\App\Infrastructure\Service\ApprovalEngineService::class);

echo "[" . date('Y-m-d H:i:s') . "] Running SLA breach check...\n";

try {
    $result = $approvalEngine->processSlaBreaches();
    echo "  Processed: " . count($result) . " SLA breaches\n";
    echo "  Done.\n";
} catch (\Exception $e) {
    echo "  ERROR: " . $e->getMessage() . "\n";
    exit(1);
}
