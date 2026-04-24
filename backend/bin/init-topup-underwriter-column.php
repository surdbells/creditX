<?php

declare(strict_types=1);

/**
 * CreditX — add top_up_balance_underwriter column to loans
 *
 * Adds the optional NUMERIC(15,2) override column used when the
 * underwriter adjusts a top-up loan's balance during their approval
 * step. See Loan::getEffectiveTopUpBalance() + DisbursementService
 * for the locking semantics.
 *
 * Idempotent — skips if the column already exists. Safe to re-run.
 *
 *   php bin/init-topup-underwriter-column.php
 */

require __DIR__ . '/../vendor/autoload.php';

if (file_exists(__DIR__ . '/../.env')) {
    $dotenv = \Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
    $dotenv->load();
}

echo "=== CreditX — add top_up_balance_underwriter to loans ===\n\n";

$em = \App\Infrastructure\Persistence\DoctrineEntityManagerFactory::create();
$conn = $em->getConnection();

$exists = $conn->fetchOne(
    "SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'loans' AND column_name = 'top_up_balance_underwriter'
     )",
);

if ($exists) {
    echo "✓ loans.top_up_balance_underwriter already exists — nothing to do.\n";
    exit(0);
}

$conn->executeStatement(
    "ALTER TABLE loans ADD COLUMN top_up_balance_underwriter NUMERIC(15, 2) NULL"
);

echo "✓ Added loans.top_up_balance_underwriter.\n";
