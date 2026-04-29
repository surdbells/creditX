<?php

declare(strict_types=1);

/**
 * CreditX — Phase-2 Schema Hardening: posting_date generated column
 *
 * Adds a Postgres-generated `posting_date` date column to
 * ledger_transactions, derived from the existing trans_year /
 * trans_month / trans_day string columns. Also adds an index on
 * the new column.
 *
 * Why: every date-range report query previously filtered with
 *
 *   CONCAT(t.trans_year, '-', t.trans_month, '-', t.trans_day) >= :from
 *
 * which can't use any index — Postgres has to evaluate the CONCAT
 * for every row. As ledger_transactions grows past ~1M rows that
 * pattern degrades sharply.
 *
 * With posting_date + idx_lt_posting_date the same range queries
 * become indexable seeks. Phase-2 code migrates every report to
 * use posting_date directly (Income Statement, Balance Sheet,
 * Trial Balance, Budget vs Actual, Period Close, ListJournalEntries,
 * ListPeriods).
 *
 * Why GENERATED ALWAYS AS ... STORED:
 *   - GENERATED keeps it in sync with the 3 string columns
 *     automatically. No backfill needed; no risk of drift.
 *   - STORED (not VIRTUAL) is the only mode Postgres supports.
 *     Disk overhead is ~4 bytes per row — negligible.
 *   - Read-only from app code: Postgres rejects any INSERT/UPDATE
 *     that supplies a value for posting_date. The entity reflects
 *     this with insertable: false, updatable: false on the column
 *     mapping.
 *
 * The 3 string columns are KEPT (not dropped). They remain the
 * canonical write path. Phase 2.5+ may deprecate them after every
 * consumer is confirmed migrated.
 *
 * Run once on upgrade:
 *   php bin/migrate-add-posting-date.php
 *
 * Idempotent — uses ADD COLUMN IF NOT EXISTS / CREATE INDEX IF
 * NOT EXISTS so re-running is a no-op.
 */

require __DIR__ . '/../vendor/autoload.php';

if (file_exists(__DIR__ . '/../.env')) {
    $dotenv = \Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
    $dotenv->load();
}

echo "=== CreditX posting_date generated column migration ===\n\n";

$em = \App\Infrastructure\Persistence\DoctrineEntityManagerFactory::create();
$conn = $em->getConnection();

// Step 1: add the generated column. Postgres derives the date by
// concatenating the 3 string fields and casting. The string fields
// are zero-padded (set via LedgerTransaction::setTransDate which
// str_pads month and day), so the cast is unambiguous.
//
// COLLATE NOTE: trans_year is 4 chars, trans_month and trans_day
// are 2 chars zero-padded. Concatenated they produce 'YYYY-MM-DD'
// which Postgres parses as a date directly.
$conn->executeStatement(
    "ALTER TABLE ledger_transactions
     ADD COLUMN IF NOT EXISTS posting_date date
     GENERATED ALWAYS AS
       ((trans_year || '-' || trans_month || '-' || trans_day)::date)
     STORED"
);
echo "✓ Column posting_date present (generated from trans_year/month/day)\n";

// Step 2: index for range queries. Standard b-tree, ascending.
$conn->executeStatement(
    "CREATE INDEX IF NOT EXISTS idx_lt_posting_date ON ledger_transactions(posting_date)"
);
echo "✓ Index idx_lt_posting_date present\n";

// Step 3: sanity-check by counting rows that successfully populated
// the generated column. Should be 100% of rows — Postgres computes
// the value at write time. A mismatch would indicate corrupt date
// strings (e.g. trans_month = '13'), which would have failed the
// generation expression — those rows would have prevented the
// ALTER TABLE from completing.
$total = (int) $conn->fetchOne("SELECT COUNT(*) FROM ledger_transactions");
$populated = (int) $conn->fetchOne("SELECT COUNT(*) FROM ledger_transactions WHERE posting_date IS NOT NULL");
echo "✓ posting_date populated for {$populated}/{$total} rows\n";

if ($populated < $total) {
    fwrite(STDERR, "WARNING: " . ($total - $populated) . " row(s) have NULL posting_date. "
        . "This shouldn't happen for a generated column. Audit those rows.\n");
}

echo "\nDone.\n";
