<?php

declare(strict_types=1);

/**
 * CreditX — Phase-2.5 sub-phase C-final: ALTER journal_entry_id to NOT NULL
 *
 * ⚠ DO NOT RUN THIS SCRIPT UNTIL SUB-PHASE D IS COMPLETE.
 *
 * After this ALTER lands, every INSERT into ledger_transactions MUST
 * supply a non-NULL journal_entry_id. The legacy posting-service
 * pattern (set entries directly without going through a JournalEntry
 * header) does NOT supply this column. Running this script before
 * the services are migrated to LedgerService::postJournal() will
 * cause every subsequent disbursement, repayment, write-off, etc.
 * to fail with 'null value in column "journal_entry_id" violates
 * not-null constraint'.
 *
 * Correct order:
 *   1. ✓ Sub-phase A — schema scaffold (table + nullable column)
 *   2. ✓ Sub-phase B — backfill historical journals
 *   3. Sub-phase C — helper service (LedgerService::postJournal) [no DDL]
 *   4. Sub-phase D — migrate all 7 posting services to use the helper
 *   5. THIS SCRIPT — tightens the constraint after services are migrated
 *
 * The script is shipped early (in C) so it lives alongside its
 * companion code. But it must NOT be run on production until D is
 * deployed and verified working.
 *
 * If the prerequisites haven't been met, the pre-flight checks below
 * will refuse to run the ALTER. Specifically:
 *   - Confirms the column exists (sub-phase A check)
 *   - Confirms zero rows have NULL journal_entry_id (sub-phase B check)
 *   - Does NOT separately confirm sub-phase D is complete; the
 *     operator must verify that themselves before running this.
 *
 * Idempotent — checks the column's current nullability state before
 * issuing ALTER. Re-running on an already-tightened column is a no-op.
 */

require __DIR__ . '/../vendor/autoload.php';

if (file_exists(__DIR__ . '/../.env')) {
    $dotenv = \Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
    $dotenv->load();
}

echo "=== CreditX Phase-2.5 sub-phase C: ALTER journal_entry_id NOT NULL ===\n\n";

$em = \App\Infrastructure\Persistence\DoctrineEntityManagerFactory::create();
$conn = $em->getConnection();

// ─── Step 0: confirm the column exists (sub-phase A ran) ────────────
$columnInfo = $conn->fetchAssociative(
    "SELECT is_nullable
     FROM information_schema.columns
     WHERE table_name = 'ledger_transactions'
       AND column_name = 'journal_entry_id'"
);
if ($columnInfo === false) {
    fwrite(STDERR, "✗ ledger_transactions.journal_entry_id column does not exist. "
        . "Run sub-phase A first:\n");
    fwrite(STDERR, "    php bin/migrate-create-journal-entries.php\n");
    exit(1);
}

if ($columnInfo['is_nullable'] === 'NO') {
    echo "✓ Column is already NOT NULL — sub-phase C is a no-op.\n";
    exit(0);
}
echo "✓ Column exists and is currently nullable; will tighten\n";

// ─── Step 1: pre-flight — confirm sub-phase B's backfill ran ────────
//
// Every existing line MUST have a non-NULL journal_entry_id, or the
// ALTER will fail. We list any that don't and abort cleanly so the
// operator gets a clear message instead of a generic Postgres error.
$nullCount = (int) $conn->fetchOne(
    "SELECT COUNT(*) FROM ledger_transactions WHERE journal_entry_id IS NULL"
);

if ($nullCount > 0) {
    fwrite(STDERR, "✗ Found {$nullCount} ledger_transactions row(s) with NULL journal_entry_id. "
        . "Sub-phase B's backfill is incomplete. Re-run it:\n\n");
    fwrite(STDERR, "    php bin/migrate-backfill-journal-entries.php\n\n");

    // Show a sample so the operator can investigate if backfill keeps failing.
    $sample = $conn->fetchAllAssociative(
        "SELECT id, trans_callback, posting_date, trans_amount, trans_narration
         FROM ledger_transactions
         WHERE journal_entry_id IS NULL
         LIMIT 10"
    );
    fwrite(STDERR, "Sample of unlinked rows:\n");
    foreach ($sample as $r) {
        fwrite(STDERR, sprintf(
            "  id=%s  callback=%s  date=%s  amount=%s\n",
            $r['id'],
            $r['trans_callback'] ?? '(NULL)',
            $r['posting_date'],
            $r['trans_amount']
        ));
    }
    exit(1);
}
echo "✓ All ledger_transactions rows have non-NULL journal_entry_id\n";

// ─── Step 2: ALTER the column ───────────────────────────────────────
//
// Postgres validates this against existing rows, so the pre-flight
// check above is critical. If it passed, the ALTER is guaranteed to
// succeed for the current data. New writes are protected by the
// constraint going forward.
//
// Note: this is a metadata change in Postgres (no rewrite required
// since the column already exists with the same physical layout).
// On a large table the ALTER is typically sub-second.
$conn->executeStatement(
    "ALTER TABLE ledger_transactions
     ALTER COLUMN journal_entry_id SET NOT NULL"
);
echo "✓ Column is now NOT NULL\n";

// ─── Verification ──────────────────────────────────────────────────
$reCheck = $conn->fetchAssociative(
    "SELECT is_nullable
     FROM information_schema.columns
     WHERE table_name = 'ledger_transactions'
       AND column_name = 'journal_entry_id'"
);
if ($reCheck['is_nullable'] !== 'NO') {
    fwrite(STDERR, "✗ Verification failed: column is still nullable after ALTER. "
        . "Aborting — investigate manually.\n");
    exit(1);
}

echo "\n✓ Sub-phase C complete. journal_entry_id is now required.\n";
echo "Next: sub-phase D will migrate posting services to use\n";
echo "LedgerService::postJournal() — first DisbursementService.\n";
