<?php

declare(strict_types=1);

/**
 * CreditX — Portal affordability fields schema init
 *
 * Supports self-service portal applicants (any individual, including the
 * self-employed) having a real affordability basis. Adds:
 *
 *   customers.employment_type        VARCHAR(20)    NULL   EMPLOYED / SELF_EMPLOYED / BUSINESS_OWNER / OTHER
 *   customers.business_name          VARCHAR(200)   NULL   Trading name for self-employed / business owners
 *   loans.applicant_monthly_income   DECIMAL(15,2)  NULL   Income snapshot at application time
 *   loans.dsr                        DECIMAL(8,6)   NULL   Debt-service ratio at application time
 *
 * Run once per environment on deploy:
 *
 *   php bin/init-portal-affordability-fields.php
 *
 * Idempotent — re-running finds existing columns and exits cleanly. Uses
 * information_schema.columns for the check, safe against Doctrine's
 * automatic column checks.
 */

require __DIR__ . '/../vendor/autoload.php';

if (file_exists(__DIR__ . '/../.env')) {
    $dotenv = \Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
    $dotenv->load();
}

echo "=== CreditX Portal Affordability Fields Schema Init ===\n\n";

$em = \App\Infrastructure\Persistence\DoctrineEntityManagerFactory::create();
$conn = $em->getConnection();

$columns = [
    ['table' => 'customers', 'name' => 'employment_type',
        'add_sql' => "ALTER TABLE customers ADD COLUMN employment_type VARCHAR(20) NULL",
        'purpose' => 'Employment classification (portal affordability basis)'],
    ['table' => 'customers', 'name' => 'business_name',
        'add_sql' => "ALTER TABLE customers ADD COLUMN business_name VARCHAR(200) NULL",
        'purpose' => 'Trading name for self-employed / business owners'],
    ['table' => 'loans', 'name' => 'applicant_monthly_income',
        'add_sql' => "ALTER TABLE loans ADD COLUMN applicant_monthly_income DECIMAL(15,2) NULL",
        'purpose' => 'Declared monthly income snapshot at application time'],
    ['table' => 'loans', 'name' => 'dsr',
        'add_sql' => "ALTER TABLE loans ADD COLUMN dsr DECIMAL(8,6) NULL",
        'purpose' => 'Debt-service ratio snapshot at application time'],
];

$addedCount = 0;
$skippedCount = 0;

foreach ($columns as $spec) {
    $exists = $conn->fetchOne(
        "SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = :tbl AND column_name = :col
        )",
        ['tbl' => $spec['table'], 'col' => $spec['name']],
    );

    if ($exists) {
        echo "✓ Column '{$spec['table']}.{$spec['name']}' already exists — skipping.\n";
        $skippedCount++;
        continue;
    }

    $conn->executeStatement($spec['add_sql']);
    echo "✓ Added column '{$spec['table']}.{$spec['name']}' — {$spec['purpose']}.\n";
    $addedCount++;
}

echo "\n";
echo "Summary: added {$addedCount}, skipped {$skippedCount}.\n";

if ($addedCount > 0) {
    echo "\nNext steps:\n";
    echo "  1. (Optional) Set the system setting 'affordability.max_dsr' (default 0.40)\n";
    echo "     to tune the soft-flag threshold for portal applications.\n";
    echo "  2. Portal loan applications now capture employment + income and store a\n";
    echo "     DSR snapshot on each loan for reviewers.\n";
}
