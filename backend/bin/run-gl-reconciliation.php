<?php

declare(strict_types=1);

/**
 * CreditX — Scheduled daily GL reconciliation
 *
 * Runs the sub-ledger ↔ control-account reconciliation scan, persists
 * a GlReconciliationRun row, and dispatches IN_APP notifications to
 * users with the 'accounting.view' permission when total discrepancy
 * exceeds the configured threshold.
 *
 * Cron entry (recommended — 06:00 Africa/Lagos):
 *   0 6 * * *  cd /www/wwwroot/creditx/backend && \
 *               TZ=Africa/Lagos sudo -u www php bin/run-gl-reconciliation.php \
 *               >> /var/log/creditx/gl-reconciliation.log 2>&1
 *
 * Manual one-off:
 *   php bin/run-gl-reconciliation.php
 *
 * Exit codes:
 *   0  scan completed (with or without discrepancies)
 *   1  scan failed (DB error, missing dependency, etc.)
 *
 * The threshold is read from the system_settings key
 * 'accounting.reconciliation_alert_threshold' (default '0.01').
 * Setting it to '0' alerts on any discrepancy; setting it higher
 * filters small rounding noise.
 */

require __DIR__ . '/../vendor/autoload.php';

if (file_exists(__DIR__ . '/../.env')) {
    $dotenv = \Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
    $dotenv->load();
}

use DI\ContainerBuilder;
use App\Infrastructure\Service\GlReconciliationService;

echo "=== CreditX GL reconciliation scheduled run ===\n";
echo "Started at: " . (new \DateTimeImmutable())->format('Y-m-d H:i:s T') . "\n\n";

try {
    // Build the container (same definitions as the HTTP app) so DI
    // resolves the service with all its dependencies — logger,
    // settings cache, EM. We don't need the HTTP middleware stack.
    $containerBuilder = new ContainerBuilder();
    $containerBuilder->addDefinitions(__DIR__ . '/../config/container.php');
    $container = $containerBuilder->build();

    /** @var GlReconciliationService $service */
    $service = $container->get(GlReconciliationService::class);

    $run = $service->runScheduled();

    echo sprintf(
        "✓ Scan complete. id=%s\n  accounts_checked=%d\n  accounts_with_discrepancy=%d\n  total_discrepancy=₦%s\n",
        $run->getId(),
        $run->getAccountsChecked(),
        $run->getAccountsWithDiscrepancy(),
        $run->getTotalDiscrepancy(),
    );

    if (bccomp($run->getTotalDiscrepancy(), '0.00', 2) > 0) {
        echo "  → Alert thresholds checked; notifications dispatched if breach occurred.\n";
    }

    exit(0);
} catch (\Throwable $e) {
    fwrite(STDERR, "✗ Scan failed: " . $e->getMessage() . "\n");
    fwrite(STDERR, $e->getTraceAsString() . "\n");
    exit(1);
}
