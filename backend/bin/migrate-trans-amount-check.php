<?php

declare(strict_types=1);

/**
 * CreditX — Phase-1 Accounting Hotfix: trans_amount > 0 CHECK
 *
 * Adds a Postgres CHECK constraint preventing negative or zero
 * trans_amount values on ledger_transactions. Direction is encoded
 * in trans_type ('DR' / 'CR'), so amounts should always be positive
 * magnitudes — a negative would corrupt totals across the IS, BS,
 * Trial Balance, and reconciliation reports.
 *
 * Why a DB constraint and not just app-level: defense in depth.
 * Application services already only post positive amounts (verified
 * via grep across all 7 posting services), but a future code change,
 * data migration, or direct DB fix could introduce a negative without
 * the DB rejecting it. The CHECK is the backstop.
 *
 * Run once on upgrade:
 *   php bin/migrate-trans-amount-check.php
 *
 * Idempotent — checks for the constraint by name before adding.
 *
 * Safety: scans existing rows for any non-positive amounts FIRST.
 * If any are found, the script reports them and exits without adding
 * the constraint (it would fail anyway, and the operator needs to
 * decide what to do with the bad data). This is the only way to add
 * a CHECK constraint to a populated table — Postgres validates
 * existing rows when CHECK is added.
 */

require __DIR__ . '/../vendor/autoload.php';

if (file_exists(__DIR__ . '/../.env')) {
    $dotenv = \Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
    $dotenv->load();
}

echo "=== CreditX trans_amount > 0 CHECK constraint ===\n\n";

$em = \App\Infrastructure\Persistence\DoctrineEntityManagerFactory::create();
$conn = $em->getConnection();

// Step 1: check the constraint isn't already present
$existing = $conn->fetchOne(
    "SELECT COUNT(*) FROM information_schema.table_constraints
     WHERE table_name = 'ledger_transactions'
       AND constraint_name = 'chk_lt_trans_amount_positive'"
);
if ((int) $existing > 0) {
    echo "✓ Constraint 'chk_lt_trans_amount_positive' already present. Nothing to do.\n";
    exit(0);
}

// Step 2: scan existing rows for any non-positive amounts
$badRows = $conn->fetchAllAssociative(
    "SELECT id, gl_id, trans_amount, trans_callback, trans_year, trans_month, trans_day
     FROM ledger_transactions
     WHERE trans_amount <= 0
     LIMIT 50"
);

if (count($badRows) > 0) {
    echo "✗ Found " . count($badRows) . " row(s) with trans_amount <= 0. "
       . "These must be resolved before the constraint can be added.\n\n";
    echo "First few rows:\n";
    foreach (array_slice($badRows, 0, 10) as $r) {
        echo sprintf(
            "  id=%s gl=%s amount=%s callback=%s date=%s-%s-%s\n",
            $r['id'], $r['gl_id'], $r['trans_amount'], $r['trans_callback'],
            $r['trans_year'], $r['trans_month'], $r['trans_day']
        );
    }
    echo "\nResolution options:\n";
    echo "  1. Reverse the affected entries via the maker-checker workflow.\n";
    echo "  2. If the entries are corrupt fixtures from dev/testing, delete\n";
    echo "     them with a manual SQL statement after auditing each one.\n";
    echo "  3. Re-run this script after the bad rows are gone.\n";
    exit(1);
}

// Step 3: add the constraint
$conn->executeStatement(
    "ALTER TABLE ledger_transactions
     ADD CONSTRAINT chk_lt_trans_amount_positive CHECK (trans_amount > 0)"
);
echo "✓ Added CHECK constraint chk_lt_trans_amount_positive (trans_amount > 0)\n";

echo "\nDone.\n";
