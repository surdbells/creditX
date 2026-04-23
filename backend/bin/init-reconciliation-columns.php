<?php

declare(strict_types=1);

/**
 * CreditX — Reconciliation Items column additions (AK)
 *
 * Adds manual-match + per-item resolution columns to the existing
 * reconciliation_items table. Idempotent — safe to re-run; each
 * ADD COLUMN is wrapped in a check against information_schema.columns.
 *
 *   php bin/init-reconciliation-columns.php
 */

require __DIR__ . '/../vendor/autoload.php';

if (file_exists(__DIR__ . '/../.env')) {
    $dotenv = \Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
    $dotenv->load();
}

echo "=== CreditX Reconciliation Items Schema Update (AK) ===\n\n";

$em = \App\Infrastructure\Persistence\DoctrineEntityManagerFactory::create();
$conn = $em->getConnection();

// Verify the base table exists — earlier schema init must have run.
$baseExists = $conn->fetchOne(
    "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'reconciliation_items')"
);
if (!$baseExists) {
    echo "ERR: reconciliation_items table doesn't exist.\n";
    echo "     Run the main schema init or seed-lite first, then retry.\n";
    exit(1);
}

/**
 * Adds a column only if it doesn't already exist. Returns true if it
 * added, false if it was already there. Keeps the script idempotent
 * — re-running is a no-op.
 */
$addIfMissing = function (string $column, string $definition) use ($conn): bool {
    $exists = $conn->fetchOne(
        "SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'reconciliation_items'
              AND column_name = :col
         )",
        ['col' => $column],
    );
    if ($exists) {
        echo "  · column '{$column}' already exists — skipping\n";
        return false;
    }
    $conn->executeStatement("ALTER TABLE reconciliation_items ADD COLUMN {$column} {$definition}");
    echo "  ✓ added column '{$column}'\n";
    return true;
};

$changes = 0;
$changes += (int) $addIfMissing('manual_match_tx_id', 'VARCHAR(36) NULL');
$changes += (int) $addIfMissing('resolution_category', 'VARCHAR(30) NULL');
$changes += (int) $addIfMissing('resolution_note', 'TEXT NULL');
$changes += (int) $addIfMissing('resolved_at', 'TIMESTAMP NULL');
$changes += (int) $addIfMissing('resolved_by', 'VARCHAR(36) NULL');

echo "\n";
if ($changes > 0) {
    echo "✓ Applied {$changes} column addition(s).\n";
} else {
    echo "✓ No changes needed — schema is already up to date.\n";
}
