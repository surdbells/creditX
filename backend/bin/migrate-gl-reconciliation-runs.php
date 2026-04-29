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
// this idempotent. Schema mirrors the GlReconciliationRun entity,
// which uses TimestampsTrait — that trait provides created_at,
// updated_at, AND created_by, updated_by columns (last two are
// audit-trail user IDs, nullable).
//
// The 'details' column stores the per-account scan output as JSON
// (Postgres native, indexable) — same data the HTTP endpoint
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
        updated_at timestamp(0) without time zone NOT NULL,
        created_by varchar(36) DEFAULT NULL,
        updated_by varchar(36) DEFAULT NULL
    )"
);
echo "✓ Table gl_reconciliation_runs present\n";

// Step 1b: backfill the audit columns on tables created by an earlier
// version of this script (which omitted created_by/updated_by). IF NOT
// EXISTS makes both ALTER calls no-ops on tables that already have them.
//
// Why this is here: the prior version of this migration created the
// table without the audit columns. Doctrine's INSERT path includes
// them per the entity mapping (TimestampsTrait), so persisting a
// GlReconciliationRun threw 42703 'column created_by does not exist'.
// This step is the corrective ALTER for tenants who ran the buggy
// version.
$conn->executeStatement(
    "ALTER TABLE gl_reconciliation_runs
     ADD COLUMN IF NOT EXISTS created_by varchar(36) DEFAULT NULL"
);
$conn->executeStatement(
    "ALTER TABLE gl_reconciliation_runs
     ADD COLUMN IF NOT EXISTS updated_by varchar(36) DEFAULT NULL"
);
echo "✓ Audit columns (created_by, updated_by) present\n";

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
echo "\nNext step: register the daily scan in aaPanel.\n";
echo "  aaPanel → Cron → Add Task\n";
echo "    Type:    Shell Script\n";
echo "    Period:  Daily, 06:00\n";
echo "    Script:\n";
echo "      cd /www/wwwroot/creditx/backend && \\\n";
echo "      sudo -u www TZ=Africa/Lagos /www/server/php/83/bin/php \\\n";
echo "        bin/run-gl-reconciliation.php\n";
echo "\n";
echo "See bin/run-gl-reconciliation.php docblock for full setup notes.\n";
