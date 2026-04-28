<?php

declare(strict_types=1);

/**
 * CreditX — Phase-1 Accounting Hotfix: is_closing_entry column
 *
 * Adds the is_closing_entry boolean column to ledger_transactions and
 * backfills it to true for all historical rows whose trans_callback
 * starts with 'CLOSE-' (PeriodCloseService's canonical prefix).
 *
 * Why: Income Statement and Trial Balance reports now filter
 * is_closing_entry = false to avoid the closed-period zero-P&L bug.
 * For the filter to produce correct results on existing data, we need
 * historical closing entries flagged.
 *
 * Run once on upgrade:
 *   php bin/migrate-closing-entries.php
 *
 * Idempotent — re-running is a no-op (CREATE COLUMN IF NOT EXISTS,
 * UPDATE only flips false -> true so already-flagged rows are
 * untouched).
 */

require __DIR__ . '/../vendor/autoload.php';

if (file_exists(__DIR__ . '/../.env')) {
    $dotenv = \Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
    $dotenv->load();
}

echo "=== CreditX is_closing_entry migration ===\n\n";

$em = \App\Infrastructure\Persistence\DoctrineEntityManagerFactory::create();
$conn = $em->getConnection();

// 1. Add column if missing. Postgres ADD COLUMN IF NOT EXISTS is
//    idempotent and faster than checking information_schema first.
$conn->executeStatement(
    "ALTER TABLE ledger_transactions
     ADD COLUMN IF NOT EXISTS is_closing_entry BOOLEAN NOT NULL DEFAULT false"
);
echo "✓ Column 'is_closing_entry' present (BOOLEAN NOT NULL DEFAULT false)\n";

// 2. Backfill historical closing entries. The CLOSE-YYYY-MM-... prefix
//    is the canonical callback format used by PeriodCloseService since
//    its inception. Any row matching this prefix was emitted by the
//    closing journal and should be flagged.
//
//    Why this is safe: the prefix is unique to PeriodCloseService —
//    no other posting path uses 'CLOSE-' as a callback prefix
//    (DisbursementService uses 'DISB-', RepaymentService 'PAY-',
//    OverdueService 'PEN-', etc.). A grep across the codebase confirms
//    PeriodCloseService is the sole emitter.
$updated = $conn->executeStatement(
    "UPDATE ledger_transactions
     SET is_closing_entry = true
     WHERE trans_callback LIKE 'CLOSE-%'
       AND is_closing_entry = false"
);
echo "✓ Backfilled {$updated} historical closing entries (callback LIKE 'CLOSE-%')\n";

echo "\nDone.\n";
