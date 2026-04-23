<?php

declare(strict_types=1);

/**
 * CreditX — Audit-column schema repair
 *
 * Backfills `created_by` + `updated_by` columns on four tables that
 * were created without them by earlier init scripts. The Doctrine
 * TimestampsTrait used by these entities maps all four of
 * created_at/updated_at/created_by/updated_by, so any Doctrine query
 * against an entity whose table is missing the *_by columns fails
 * with a 42703 "undefined column" error.
 *
 * Affected tables:
 *   accounting_periods    — missing created_by + updated_by
 *   budgets               — missing updated_by
 *   provision_runs        — missing updated_by
 *   provision_run_lines   — missing created_by + updated_by
 *
 * The matching init scripts have been corrected so fresh deploys
 * don't repeat the mistake. Existing deploys need this migration.
 *
 * Idempotent — each ADD COLUMN is gated on a check against
 * information_schema.columns. Safe to re-run.
 *
 *   php bin/init-audit-columns-repair.php
 */

require __DIR__ . '/../vendor/autoload.php';

if (file_exists(__DIR__ . '/../.env')) {
    $dotenv = \Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
    $dotenv->load();
}

echo "=== CreditX Audit-Column Schema Repair ===\n\n";

$em = \App\Infrastructure\Persistence\DoctrineEntityManagerFactory::create();
$conn = $em->getConnection();

/**
 * Add a nullable VARCHAR(36) column to a table if it isn't already
 * there. Returns true iff the column was added.
 */
$addAuditColumn = function (string $table, string $column) use ($conn): bool {
    $exists = $conn->fetchOne(
        "SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = :t AND column_name = :c
         )",
        ['t' => $table, 'c' => $column],
    );
    if ($exists) {
        echo "  · {$table}.{$column} already exists — skipping\n";
        return false;
    }
    $conn->executeStatement("ALTER TABLE {$table} ADD COLUMN {$column} VARCHAR(36) NULL");
    echo "  ✓ {$table}.{$column} added\n";
    return true;
};

/**
 * A single table can require up to two additions (created_by and
 * updated_by). Also verify the parent table exists — if it doesn't,
 * skip silently; the corresponding init script will create it with
 * the right columns on first run.
 */
$ensureAuditColumns = function (string $table) use ($conn, $addAuditColumn): int {
    $tableExists = $conn->fetchOne(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = :t)",
        ['t' => $table],
    );
    if (!$tableExists) {
        echo "  - {$table} does not exist yet — skip (run the table's init script first)\n";
        return 0;
    }
    $changes = 0;
    $changes += (int) $addAuditColumn($table, 'created_by');
    $changes += (int) $addAuditColumn($table, 'updated_by');
    return $changes;
};

$total = 0;
foreach (['accounting_periods', 'budgets', 'provision_runs', 'provision_run_lines'] as $table) {
    echo "→ {$table}\n";
    $total += $ensureAuditColumns($table);
}

echo "\n";
if ($total > 0) {
    echo "✓ Applied {$total} column addition(s). Disbursement + period close should work now.\n";
} else {
    echo "✓ No changes needed — schema is already up to date.\n";
}
