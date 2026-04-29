<?php

declare(strict_types=1);

/**
 * CreditX — Phase-2.5 sub-phase A: JournalEntry aggregate scaffold
 *
 * Creates the journal_entries table and adds the journal_entry_id
 * FK column to ledger_transactions. No data is migrated; no posting
 * service is changed. This script is the schema scaffold that makes
 * subsequent sub-phases safe to deploy.
 *
 * Sub-phase plan (this script is part of A):
 *   A. Schema scaffold + new entity (this commit)
 *   B. Backfill historical journals from trans_callback grouping
 *   C. Make journal_entry_id NOT NULL + add LedgerService.postJournal helper
 *   D. Migrate posting services one at a time
 *   E. Migrate query consumers (ListJournalEntries, Reconciliation)
 *   F. Frontend Journal Entries page redesign
 *
 * Run order on upgrade:
 *   1. php bin/migrate-create-journal-entries.php   (THIS SCRIPT — must run BEFORE reload)
 *   2. sudo systemctl reload php-fpm-83             (live the new entity mapping)
 *
 * Why "before reload": once the new code is live, Doctrine's INSERT
 * for LedgerTransaction includes journal_entry_id (with NULL value)
 * per the entity mapping. If this column doesn't exist yet, every
 * disbursement, repayment, and other posting-service action will
 * fail with "column journal_entry_id does not exist".
 *
 * Idempotent — uses CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT
 * EXISTS, CREATE INDEX IF NOT EXISTS. Safe to re-run.
 *
 * Important: this script does NOT add a NOT NULL constraint on
 * journal_entry_id. That happens in sub-phase C, AFTER backfill
 * (sub-phase B) populates every existing row. Adding NOT NULL now
 * would orphan all historical lines.
 */

require __DIR__ . '/../vendor/autoload.php';

if (file_exists(__DIR__ . '/../.env')) {
    $dotenv = \Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
    $dotenv->load();
}

echo "=== CreditX Phase-2.5 sub-phase A: JournalEntry scaffold ===\n\n";

$em = \App\Infrastructure\Persistence\DoctrineEntityManagerFactory::create();
$conn = $em->getConnection();

// ─── Step 1: create journal_entries table ───────────────────────────
//
// Schema mirrors the JournalEntry entity. Includes the four columns
// from TimestampsTrait (created_at, updated_at, created_by, updated_by)
// — Phase-2 hotfix lesson: don't define a TimestampsTrait-using entity's
// table without all four. Doctrine's INSERT references all four per
// the trait mapping; missing columns throw 42703 at flush time.
$conn->executeStatement(
    "CREATE TABLE IF NOT EXISTS journal_entries (
        id varchar(36) NOT NULL PRIMARY KEY,
        posting_date date NOT NULL,
        entry_type varchar(20) NOT NULL,
        narration varchar(500) NOT NULL,
        reference varchar(100) DEFAULT NULL,
        posted_by varchar(36) DEFAULT NULL,
        is_reversal boolean NOT NULL DEFAULT false,
        reversal_of_id varchar(36) DEFAULT NULL,
        is_closing_entry boolean NOT NULL DEFAULT false,
        legacy_callback varchar(100) DEFAULT NULL,
        created_at timestamp(0) without time zone NOT NULL,
        updated_at timestamp(0) without time zone NOT NULL,
        created_by varchar(36) DEFAULT NULL,
        updated_by varchar(36) DEFAULT NULL
    )"
);
echo "✓ Table journal_entries present\n";

// Indexes: posting_date for date-range filters, entry_type for category
// filters, reversal_of_id for reversal-chain traversal, legacy_callback
// for sub-phase B's backfill grouping query.
$conn->executeStatement("CREATE INDEX IF NOT EXISTS idx_je_posting_date ON journal_entries(posting_date)");
$conn->executeStatement("CREATE INDEX IF NOT EXISTS idx_je_entry_type ON journal_entries(entry_type)");
$conn->executeStatement("CREATE INDEX IF NOT EXISTS idx_je_reversal_of ON journal_entries(reversal_of_id)");
$conn->executeStatement("CREATE INDEX IF NOT EXISTS idx_je_legacy_callback ON journal_entries(legacy_callback)");
echo "✓ Indexes on journal_entries present\n";

// ─── Step 2: self-FK for reversal_of_id ─────────────────────────────
//
// reversal_of_id points to another journal_entries row. The FK is
// optional (NULL means "not a reversal"), and ON DELETE SET NULL so
// deleting an original journal doesn't cascade-delete its reversal —
// the reversal is the audit-trail evidence the original was reversed,
// and should survive the original's removal.
//
// Note: services should never delete journals. This FK behavior is
// defense in depth for the unlikely-but-possible case.
$existsRevFk = $conn->fetchOne(
    "SELECT COUNT(*) FROM information_schema.table_constraints
     WHERE table_name = 'journal_entries'
       AND constraint_name = 'fk_je_reversal_of'"
);
if ((int) $existsRevFk === 0) {
    $conn->executeStatement(
        "ALTER TABLE journal_entries
         ADD CONSTRAINT fk_je_reversal_of
         FOREIGN KEY (reversal_of_id) REFERENCES journal_entries(id)
         ON DELETE SET NULL"
    );
    echo "✓ FK fk_je_reversal_of (journal_entries.reversal_of_id → journal_entries.id) added\n";
} else {
    echo "✓ FK fk_je_reversal_of already present\n";
}

// ─── Step 3: add journal_entry_id column to ledger_transactions ─────
//
// NULLABLE for now. Sub-phase B will populate; sub-phase C will
// ALTER to NOT NULL. Adding it nullable now means existing rows
// don't need backfill before this column is usable, and the new
// code path (which sets journal_entry_id on every INSERT) doesn't
// fail on the column not existing yet.
$conn->executeStatement(
    "ALTER TABLE ledger_transactions
     ADD COLUMN IF NOT EXISTS journal_entry_id varchar(36) DEFAULT NULL"
);
echo "✓ Column ledger_transactions.journal_entry_id present (nullable)\n";

// Index for the FK — Doctrine's persister uses this for fetch-by-FK
// joins when loading lines via the JournalEntry aggregate.
$conn->executeStatement(
    "CREATE INDEX IF NOT EXISTS idx_lt_journal_entry ON ledger_transactions(journal_entry_id)"
);
echo "✓ Index idx_lt_journal_entry present\n";

// ─── Step 4: FK constraint ledger_transactions → journal_entries ────
//
// ON DELETE CASCADE: if a journal_entry is somehow deleted, its lines
// go with it. Lines without a header would corrupt the GL (debits not
// matching credits), so cascading is the right behavior. Again,
// services should never delete journals — this is defense in depth.
$existsLineFk = $conn->fetchOne(
    "SELECT COUNT(*) FROM information_schema.table_constraints
     WHERE table_name = 'ledger_transactions'
       AND constraint_name = 'fk_lt_journal_entry'"
);
if ((int) $existsLineFk === 0) {
    $conn->executeStatement(
        "ALTER TABLE ledger_transactions
         ADD CONSTRAINT fk_lt_journal_entry
         FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id)
         ON DELETE CASCADE"
    );
    echo "✓ FK fk_lt_journal_entry (ledger_transactions.journal_entry_id → journal_entries.id) added\n";
} else {
    echo "✓ FK fk_lt_journal_entry already present\n";
}

// ─── Verification ──────────────────────────────────────────────────
$totalLt = (int) $conn->fetchOne("SELECT COUNT(*) FROM ledger_transactions");
$linkedLt = (int) $conn->fetchOne("SELECT COUNT(*) FROM ledger_transactions WHERE journal_entry_id IS NOT NULL");
$totalJe = (int) $conn->fetchOne("SELECT COUNT(*) FROM journal_entries");

echo "\nState after migration:\n";
echo "  journal_entries rows:        {$totalJe}\n";
echo "  ledger_transactions total:   {$totalLt}\n";
echo "  ledger_transactions linked:  {$linkedLt}\n";
echo "  ledger_transactions to backfill: " . ($totalLt - $linkedLt) . "\n";

echo "\nDone.\n";

if ($totalLt > 0 && $linkedLt < $totalLt) {
    $unlinked = $totalLt - $linkedLt;
    echo "\nNext step: run sub-phase B's backfill to populate journal_entry_id\n";
    echo "for the {$unlinked} historical line(s) without a header.\n";
    echo "\nDO NOT add NOT NULL to journal_entry_id yet — sub-phase C does that\n";
    echo "after backfill completes.\n";
} elseif ($totalLt === 0) {
    echo "\nNo existing ledger_transactions rows. Sub-phase B (backfill) will\n";
    echo "be a no-op when run, but should still be run for idempotency.\n";
}
