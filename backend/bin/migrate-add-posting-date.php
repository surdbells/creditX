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

// Step 0: pre-validate existing data. Postgres make_date() throws if
// any row has out-of-range values (e.g. trans_month='13'), and the
// ALTER TABLE would fail mid-statement leaving the column not added.
// Better to surface bad data here with a clear error than to inherit
// a Postgres "date field value out of range" with no row context.
//
// Why this check runs before the ALTER:
//   - make_date(int,int,int) is the IMMUTABLE function we use in the
//     generation expression. It validates ranges (year 0001-9999,
//     month 1-12, day 1-31 plus per-month validity).
//   - text::int cast parses the zero-padded strings; '01' -> 1.
//   - LedgerTransaction::setTransDate str_pads month/day so well-
//     behaved app writes are fine. The pre-check guards against
//     historical bad data we can't see from here.
$badRows = $conn->fetchAllAssociative(
    "SELECT id, trans_year, trans_month, trans_day
     FROM ledger_transactions
     WHERE trans_year !~ '^\\d{4}$'
        OR trans_month !~ '^\\d{2}$'
        OR trans_day !~ '^\\d{2}$'
        OR CAST(trans_month AS INTEGER) NOT BETWEEN 1 AND 12
        OR CAST(trans_day AS INTEGER) NOT BETWEEN 1 AND 31
     LIMIT 50"
);
if (count($badRows) > 0) {
    fwrite(STDERR, "✗ Found " . count($badRows) . " row(s) with malformed trans_year/month/day. "
        . "Generated-column ALTER would fail. First few rows:\n\n");
    foreach (array_slice($badRows, 0, 10) as $r) {
        fwrite(STDERR, sprintf(
            "  id=%s year=%s month=%s day=%s\n",
            $r['id'], $r['trans_year'], $r['trans_month'], $r['trans_day']
        ));
    }
    fwrite(STDERR, "\nResolve manually (audit each row, fix or delete via SQL) "
        . "and re-run this script.\n");
    exit(1);
}
echo "✓ All trans_year/month/day values are well-formed\n";

// Step 1: add the generated column.
//
// Postgres requires generated-column expressions to be IMMUTABLE.
// '...::date' is STABLE (depends on session DateStyle), so the
// previous attempt failed with 42P17. The fix uses make_date() —
// IMMUTABLE since Postgres 10 — combined with text::int casts
// (also IMMUTABLE).
//
// Disk overhead: ~4 bytes per row. Negligible.
//
// Read-only from app code: Postgres rejects any INSERT/UPDATE that
// supplies a value for posting_date. The entity reflects this with
// insertable: false, updatable: false on the column mapping.
$conn->executeStatement(
    "ALTER TABLE ledger_transactions
     ADD COLUMN IF NOT EXISTS posting_date date
     GENERATED ALWAYS AS (
         make_date(
             CAST(trans_year AS INTEGER),
             CAST(trans_month AS INTEGER),
             CAST(trans_day AS INTEGER)
         )
     ) STORED"
);
echo "✓ Column posting_date present (generated via make_date)\n";

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
