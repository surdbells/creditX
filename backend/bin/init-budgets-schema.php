<?php

declare(strict_types=1);

/**
 * CreditX — Budgets schema initialiser
 *
 * Adds the budgets table if it doesn't exist. Run once on deploy:
 *
 *   php bin/init-budgets-schema.php
 *
 * Idempotent — re-running does nothing.
 *
 * Schema mirrors the Doctrine-annotated entity (App\Domain\Entity\Budget):
 *   - id                VARCHAR(36) PRIMARY KEY
 *   - gl_id             VARCHAR(36) FK to general_ledgers
 *   - year              VARCHAR(4)
 *   - month             VARCHAR(2)
 *   - amount            NUMERIC(15,2)
 *   - notes             TEXT NULL
 *   - created_by        VARCHAR(36) NULL (user UUID)
 *   - created_at        TIMESTAMP NOT NULL
 *   - updated_at        TIMESTAMP NOT NULL
 *   UNIQUE (gl_id, year, month)  — one budget per account per month
 */

require __DIR__ . '/../vendor/autoload.php';

if (file_exists(__DIR__ . '/../.env')) {
    $dotenv = \Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
    $dotenv->load();
}

echo "=== CreditX Budgets Schema Init ===\n\n";

$em = \App\Infrastructure\Persistence\DoctrineEntityManagerFactory::create();
$conn = $em->getConnection();

$exists = $conn->fetchOne(
    "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'budgets')"
);

if ($exists) {
    echo "✓ Table 'budgets' already exists. Nothing to do.\n";
    exit(0);
}

$conn->executeStatement("
    CREATE TABLE budgets (
        id VARCHAR(36) NOT NULL PRIMARY KEY,
        gl_id VARCHAR(36) NOT NULL REFERENCES general_ledgers(id),
        year VARCHAR(4) NOT NULL,
        month VARCHAR(2) NOT NULL,
        amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
        notes TEXT NULL,
        -- TimestampsTrait audit columns (all four required — see
        -- init-audit-columns-repair.php for background on the 42703
        -- class of errors this prevents).
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_by VARCHAR(36) NULL,
        updated_by VARCHAR(36) NULL,
        CONSTRAINT uq_budget_gl_year_month UNIQUE (gl_id, year, month)
    );
    CREATE INDEX idx_budget_year_month ON budgets(year, month);
");

echo "✓ Created table 'budgets'.\n";
echo "✓ Created unique constraint 'uq_budget_gl_year_month'.\n";
echo "✓ Created index 'idx_budget_year_month'.\n";

echo "\nNext steps:\n";
echo "  1. Grant the 'accounting.budget' permission to the accountant role.\n";
echo "  2. Navigate to /budgets to set targets for the current period.\n";
echo "  3. View /reports/budget-vs-actual to compare targets to actuals.\n";
