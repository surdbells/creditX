<?php

declare(strict_types=1);

/**
 * CreditX — Provision Runs schema initialiser
 *
 * Creates provision_runs and provision_run_lines tables if they
 * don't exist. Idempotent — safe to re-run.
 *
 *   php bin/init-provisions-schema.php
 */

require __DIR__ . '/../vendor/autoload.php';

if (file_exists(__DIR__ . '/../.env')) {
    $dotenv = \Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
    $dotenv->load();
}

echo "=== CreditX Provisions Schema Init ===\n\n";

$em = \App\Infrastructure\Persistence\DoctrineEntityManagerFactory::create();
$conn = $em->getConnection();

$runsExists = $conn->fetchOne(
    "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'provision_runs')"
);
$linesExists = $conn->fetchOne(
    "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'provision_run_lines')"
);

if ($runsExists && $linesExists) {
    echo "✓ Both tables already exist. Nothing to do.\n";
    exit(0);
}

// Order matters — lines FK references runs.
if (!$runsExists) {
    $conn->executeStatement("
        CREATE TABLE provision_runs (
            id VARCHAR(36) NOT NULL PRIMARY KEY,
            as_of DATE NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'posted',
            callback_ref VARCHAR(100) NULL,
            total_provision_required NUMERIC(15, 2) NOT NULL DEFAULT 0,
            total_prior_provision NUMERIC(15, 2) NOT NULL DEFAULT 0,
            total_delta_posted NUMERIC(15, 2) NOT NULL DEFAULT 0,
            loan_count INTEGER NOT NULL DEFAULT 0,
            notes TEXT NULL,
            reversed_at TIMESTAMP NULL,
            reversed_by VARCHAR(36) NULL,
            reversal_reason TEXT NULL,
            -- TimestampsTrait audit columns (all four required)
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            created_by VARCHAR(36) NULL,
            updated_by VARCHAR(36) NULL
        );
        CREATE INDEX idx_provrun_status_as_of ON provision_runs(status, as_of);
    ");
    echo "✓ Created table 'provision_runs'.\n";
}

if (!$linesExists) {
    $conn->executeStatement("
        CREATE TABLE provision_run_lines (
            id VARCHAR(36) NOT NULL PRIMARY KEY,
            run_id VARCHAR(36) NOT NULL REFERENCES provision_runs(id) ON DELETE CASCADE,
            loan_id VARCHAR(36) NOT NULL REFERENCES loans(id),
            application_id_snapshot VARCHAR(30) NOT NULL,
            outstanding_snapshot NUMERIC(15, 2) NOT NULL DEFAULT 0,
            days_overdue_snapshot INTEGER NOT NULL DEFAULT 0,
            classification VARCHAR(20) NOT NULL,
            provision_rate NUMERIC(5, 4) NOT NULL,
            provision_amount_required NUMERIC(15, 2) NOT NULL DEFAULT 0,
            prior_provision_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
            delta_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
            -- TimestampsTrait audit columns (all four required)
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            created_by VARCHAR(36) NULL,
            updated_by VARCHAR(36) NULL
        );
        CREATE INDEX idx_provline_loan ON provision_run_lines(loan_id);
        CREATE INDEX idx_provline_run ON provision_run_lines(run_id);
    ");
    echo "✓ Created table 'provision_run_lines'.\n";
}

echo "\nNext steps:\n";
echo "  1. Re-run php bin/seed-lite.php to seed LLP + ALLOW + RETEARN GLs\n";
echo "     and grant accounting.provision to the accountant role.\n";
echo "  2. Navigate to /provisions to preview + post your first run.\n";
