<?php

declare(strict_types=1);

/**
 * CreditX — Phase-2 Schema Hardening: GL reconciliation runs table
 * + alert threshold setting.
 *
 * Adds the gl_reconciliation_runs table (history of scheduled
 * reconciliation scans) and seeds the
 * accounting.reconciliation_alert_threshold system setting.
 *
 * The table is needed by GlReconciliationService::runScheduled()
 * which persists one row per scan (see backend/bin/run-gl-reconciliation.php
 * for the cron entrypoint).
 *
 * The threshold setting controls when the scheduled scan dispatches
 * IN_APP notifications to users with the 'accounting.view'
 * permission. Default '0.01' means "alert on any kobo of mismatch."
 * Operators tuning out small rounding noise can raise it; setting
 * '0' alerts on any non-zero discrepancy.
 *
 * Run once on upgrade:
 *   php bin/migrate-gl-reconciliation-runs.php
 *
 * Idempotent — checks for table existence and setting existence
 * before creating either.
 */

require __DIR__ . '/../vendor/autoload.php';

if (file_exists(__DIR__ . '/../.env')) {
    $dotenv = \Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
    $dotenv->load();
}

use App\Domain\Entity\SystemSetting;
use App\Domain\Enum\SettingCategory;
use App\Domain\Enum\SettingType;

echo "=== CreditX gl_reconciliation_runs migration ===\n\n";

$em = \App\Infrastructure\Persistence\DoctrineEntityManagerFactory::create();
$conn = $em->getConnection();

// Step 1: create the table. Postgres CREATE TABLE IF NOT EXISTS makes
// this idempotent. Schema mirrors the GlReconciliationRun entity.
//
// The 'details' column stores the per-account scan output as JSONB
// (Postgres native JSON with indexing) — same data the HTTP endpoint
// returns, persisted verbatim so audit reviewers can reconstruct
// the exact state at scan time.
$conn->executeStatement(
    "CREATE TABLE IF NOT EXISTS gl_reconciliation_runs (
        id varchar(36) NOT NULL PRIMARY KEY,
        started_at timestamp(0) without time zone NOT NULL,
        completed_at timestamp(0) without time zone NOT NULL,
        accounts_checked integer NOT NULL DEFAULT 0,
        accounts_with_discrepancy integer NOT NULL DEFAULT 0,
        total_discrepancy numeric(15,2) NOT NULL DEFAULT '0.00',
        details json NOT NULL DEFAULT '[]',
        created_at timestamp(0) without time zone NOT NULL,
        updated_at timestamp(0) without time zone NOT NULL
    )"
);
echo "✓ Table gl_reconciliation_runs present\n";

$conn->executeStatement(
    "CREATE INDEX IF NOT EXISTS idx_glr_started ON gl_reconciliation_runs(started_at)"
);
echo "✓ Index idx_glr_started present\n";

// Step 2: seed the threshold setting if missing. We do NOT overwrite
// an existing value — if the operator has tuned it (e.g. raised to
// '1000.00' to filter rounding noise), we preserve their choice.
$key = 'accounting.reconciliation_alert_threshold';
$existing = $em->getRepository(SystemSetting::class)->findOneBy(['key' => $key]);
if ($existing === null) {
    $setting = new SystemSetting();
    $setting->setKey($key);
    $setting->setValue('0.01');
    $setting->setType(SettingType::STRING);
    $setting->setCategory(SettingCategory::ACCOUNTING);
    $setting->setDescription(
        'Total-discrepancy threshold (naira) above which the daily GL '
      . 'reconciliation scan dispatches an in-app alert. 0 = alert on '
      . 'any non-zero discrepancy. Default 0.01.'
    );
    $em->persist($setting);
    $em->flush();
    echo "✓ Created setting {$key} = 0.01\n";
} else {
    echo "✓ Setting {$key} already present (value: {$existing->getValue()})\n";
}

echo "\nDone.\n";
echo "\nNext step: configure the cron entry. Recommended schedule:\n";
echo "  0 6 * * *  cd /www/wwwroot/creditx/backend && \\\n";
echo "             TZ=Africa/Lagos sudo -u www php bin/run-gl-reconciliation.php \\\n";
echo "             >> /var/log/creditx/gl-reconciliation.log 2>&1\n";
