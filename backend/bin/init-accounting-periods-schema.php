<?php

declare(strict_types=1);

/**
 * CreditX — Accounting Periods schema initialiser
 *
 * Adds the accounting_periods table if it doesn't exist. Run once on
 * upgrade:
 *
 *   php bin/init-accounting-periods-schema.php
 *
 * Idempotent — re-running is a no-op.
 *
 * Replaces running doctrine:schema:update in environments where we
 * don't have the symfony CLI wired up.
 */

require __DIR__ . '/../vendor/autoload.php';

if (file_exists(__DIR__ . '/../.env')) {
    $dotenv = \Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
    $dotenv->load();
}

echo "=== CreditX Accounting Periods Schema Init ===\n\n";

$em = \App\Infrastructure\Persistence\DoctrineEntityManagerFactory::create();
$conn = $em->getConnection();

// Check if table exists
$exists = $conn->fetchOne(
    "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'accounting_periods')"
);

if ($exists) {
    echo "✓ Table 'accounting_periods' already exists. Nothing to do.\n";
    exit(0);
}

// Create the table. Schema matches the Doctrine-annotated entity
// (App\Domain\Entity\AccountingPeriod).
$sql = "
    CREATE TABLE accounting_periods (
        id VARCHAR(36) NOT NULL PRIMARY KEY,
        year VARCHAR(4) NOT NULL,
        month VARCHAR(2) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'open',
        closing_callback VARCHAR(100) NULL,
        net_income_posted NUMERIC(15, 2) NULL,
        closed_at TIMESTAMP NULL,
        closed_by VARCHAR(36) NULL,
        notes TEXT NULL,
        -- TimestampsTrait audit columns. The trait maps all four of
        -- created_at/updated_at/created_by/updated_by; missing any of
        -- them on the physical table causes a 42703 error on every
        -- Doctrine query against this entity.
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_by VARCHAR(36) NULL,
        updated_by VARCHAR(36) NULL,
        CONSTRAINT uq_ap_year_month UNIQUE (year, month)
    );
    CREATE INDEX idx_ap_status ON accounting_periods(status);
";

$conn->executeStatement($sql);

echo "✓ Created table 'accounting_periods'.\n";
echo "✓ Created index 'idx_ap_status'.\n";
echo "✓ Created unique constraint 'uq_ap_year_month'.\n";
echo "\nNext steps:\n";
echo "  1. Seed a Retained Earnings GL (accountCode=RETEARN, accountType=equity)\n";
echo "     via the Chart of Accounts UI or your seed script.\n";
echo "  2. Add 'accounting.close' permission to the relevant roles:\n";
echo "     UPDATE role_permissions ... or via seed-lite.\n";
echo "  3. Navigate to /period-close to close your first month.\n";
