<?php

declare(strict_types=1);

/**
 * CreditX — monthly fixed-asset depreciation job.
 *
 * Posts straight-line depreciation for a period:
 *   DR Depreciation Expense / CR Accumulated Depreciation
 *
 * Usage:
 *   php bin/run-depreciation.php                # depreciate PREVIOUS month
 *   php bin/run-depreciation.php 2026 05        # a specific period
 *   php bin/run-depreciation.php --preview      # preview previous month
 *
 * Schedule on the 1st of each month. Idempotent per (asset, period).
 */

require __DIR__ . '/../vendor/autoload.php';

if (file_exists(__DIR__ . '/../.env')) {
    (\Dotenv\Dotenv::createImmutable(__DIR__ . '/..'))->load();
}

$definitions = require __DIR__ . '/../config/container.php';
$builder = new \DI\ContainerBuilder();
$builder->addDefinitions($definitions);
$dic = $builder->build();

// Scheduled job: declare a trusted system actor so accounting-date rules
// allow the dates this job computes for itself (period ends, maturity dates)
// rather than treating them as an unauthenticated backdating attempt.
\App\Infrastructure\Service\PostingContextRegistry::setSystem(basename(__FILE__));

/** @var \App\Infrastructure\Service\FixedAssetService $service */
$service = $dic->get(\App\Infrastructure\Service\FixedAssetService::class);

$args = array_values(array_filter($argv ?? [], fn($a) => $a !== ''));
array_shift($args);
$preview = in_array('--preview', $args, true);
$args = array_values(array_filter($args, fn($a) => !str_starts_with($a, '--')));

if (count($args) >= 2) {
    $year = $args[0]; $month = $args[1];
} else {
    $prev = (new \DateTimeImmutable('first day of this month'))->modify('-1 day');
    $year = $prev->format('Y'); $month = $prev->format('m');
}

echo '[' . date('Y-m-d H:i:s') . "] Depreciation — {$year}-{$month}" . ($preview ? ' (preview)' : '') . "\n";

try {
    if ($preview) {
        $p = $service->depreciatePreview($year, $month);
        echo "  Assets: {$p['summary']['asset_count']}\n";
        echo "  Total:  {$p['summary']['total']}\n";
        echo "  (preview only)\n";
    } else {
        $r = $service->depreciateRun($year, $month, null);
        echo "  Assets: {$r['asset_count']}\n";
        echo "  Total:  {$r['total']}\n";
        echo "  Done.\n";
    }
} catch (\Throwable $e) {
    echo '  ERROR: ' . $e->getMessage() . "\n";
    exit(1);
}
