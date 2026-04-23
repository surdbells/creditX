<?php

declare(strict_types=1);

/**
 * CreditX — Customer CBN fields schema init
 *
 * Adds three columns to the customers table needed for CBN
 * regulatory returns (commit AG):
 *
 *   - nin                   VARCHAR(20)   NULL    National ID Number
 *   - is_insider            BOOLEAN       NOT NULL DEFAULT FALSE
 *   - insider_relationship  VARCHAR(100)  NULL    Free-text nature of relationship
 *
 * Run once per environment on deploy:
 *
 *   php bin/init-customer-cbn-fields.php
 *
 * Idempotent — re-running finds the columns already exist and
 * exits cleanly. Uses information_schema.columns for the check,
 * which is safe against Doctrine's automatic column checks.
 */

require __DIR__ . '/../vendor/autoload.php';

if (file_exists(__DIR__ . '/../.env')) {
    $dotenv = \Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
    $dotenv->load();
}

echo "=== CreditX Customer CBN Fields Schema Init ===\n\n";

$em = \App\Infrastructure\Persistence\DoctrineEntityManagerFactory::create();
$conn = $em->getConnection();

$columns = [
    'nin' => [
        'add_sql' => "ALTER TABLE customers ADD COLUMN nin VARCHAR(20) NULL",
        'purpose' => 'National ID Number (CBN CRMS requirement)',
    ],
    'is_insider' => [
        'add_sql' => "ALTER TABLE customers ADD COLUMN is_insider BOOLEAN NOT NULL DEFAULT FALSE",
        'purpose' => 'Flag for CBN Insider-Related Credit return',
    ],
    'insider_relationship' => [
        'add_sql' => "ALTER TABLE customers ADD COLUMN insider_relationship VARCHAR(100) NULL",
        'purpose' => 'Nature of insider relationship (Director, Employee, Affiliate, etc.)',
    ],
];

$addedCount = 0;
$skippedCount = 0;

foreach ($columns as $colName => $spec) {
    $exists = $conn->fetchOne(
        "SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'customers' AND column_name = :col
        )",
        ['col' => $colName],
    );

    if ($exists) {
        echo "✓ Column 'customers.{$colName}' already exists — skipping.\n";
        $skippedCount++;
        continue;
    }

    $conn->executeStatement($spec['add_sql']);
    echo "✓ Added column 'customers.{$colName}' — {$spec['purpose']}.\n";
    $addedCount++;
}

echo "\n";
echo "Summary: added {$addedCount}, skipped {$skippedCount}.\n";

if ($addedCount > 0) {
    echo "\nNext steps:\n";
    echo "  1. Navigate to /reports/cbn-returns to view the four CBN regulatory returns.\n";
    echo "  2. Edit the customer records for any directors/employees/affiliates and\n";
    echo "     flip the 'Insider-related' toggle in the customer form.\n";
    echo "  3. Backfill NIN on customer records where BVN is present but NIN is not —\n";
    echo "     both are required by CRMS returns.\n";
}
