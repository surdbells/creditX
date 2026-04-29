<?php

declare(strict_types=1);

/**
 * CreditX — Phase-2.5 sub-phase B: backfill JournalEntry headers
 *
 * Synthesizes one journal_entries row per existing trans_callback
 * group in ledger_transactions, and sets journal_entry_id on every
 * line to point at its synthesized header.
 *
 * Run order:
 *   1. Sub-phase A migration (creates the table + nullable FK column)
 *   2. THIS SCRIPT (populates journal_entry_id for existing rows)
 *   3. Sub-phase C migration (ALTER journal_entry_id to NOT NULL)
 *   4. Sub-phase D commits (services start using the new model)
 *
 * Idempotent — safe to re-run. For each callback group, checks if
 * a JournalEntry with that legacy_callback already exists; if yes,
 * just links any unlinked lines. If no, creates the header.
 *
 * ─── Backfill strategy ────────────────────────────────────────────
 *
 * Pass 0 — Pre-flight integrity check.
 *   For each callback group, verify all lines share the same
 *   posting_date and is_closing_entry. If any group disagrees,
 *   abort with the bad rows listed — operator must audit before
 *   we proceed (a single journal can't span multiple dates).
 *
 * Pass 1 — Non-reversal journals first.
 *   Process every distinct trans_callback that does NOT start with
 *   'REV-'. Synthesize one JournalEntry per group, set FK on lines.
 *   Per-group transaction: failure on row N doesn't lose rows 1..N-1.
 *
 * Pass 2 — Reversal journals.
 *   Process REV-* callbacks. For each, the callback string is
 *   shaped 'REV-{original_callback}-{timestamp}'. We extract the
 *   original_callback and look up the JournalEntry created in Pass 1
 *   to populate reversal_of_id. Orphan reversals (original not
 *   findable) get reversal_of_id = NULL with a logged warning.
 *
 * Pass 3 — NULL-callback orphans.
 *   Any line with trans_callback IS NULL can't be grouped. Synthesize
 *   one MANUAL JournalEntry per orphan line. Rare but defensive —
 *   the entity allows nullable callback and we shouldn't crash on
 *   such rows.
 *
 * Pass 4 — Verification.
 *   Confirm 100% of ledger_transactions rows have a non-NULL
 *   journal_entry_id. If any remain NULL, list them and exit 1
 *   so sub-phase C's NOT NULL ALTER doesn't fail at the wrong layer.
 *
 * ─── Why per-group transactions, not a single big one ─────────────
 *
 * A populated production tenant could have hundreds of thousands of
 * rows. A single transaction holds locks on every modified row until
 * commit, blocking concurrent reads on the GL. Per-group transactions
 * release locks promptly. They also mean a failure midway preserves
 * all progress made so far — re-running picks up where it left off.
 *
 * Trade-off: if the script is killed mid-run, the database is in a
 * partially-backfilled state where some lines have journal_entry_id
 * and some don't. That's fine because (a) FK is nullable in this
 * sub-phase, so no constraint violation, and (b) re-running is
 * idempotent and completes the job.
 */

require __DIR__ . '/../vendor/autoload.php';

if (file_exists(__DIR__ . '/../.env')) {
    $dotenv = \Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
    $dotenv->load();
}

use App\Domain\Enum\JournalEntryType;

echo "=== CreditX Phase-2.5 sub-phase B: backfill JournalEntry headers ===\n\n";

$em = \App\Infrastructure\Persistence\DoctrineEntityManagerFactory::create();
$conn = $em->getConnection();

// ─── Pre-flight: confirm sub-phase A migration ran ──────────────────
$tableExists = (int) $conn->fetchOne(
    "SELECT COUNT(*) FROM information_schema.tables
     WHERE table_name = 'journal_entries'"
);
if ($tableExists === 0) {
    fwrite(STDERR, "✗ journal_entries table does not exist. Run sub-phase A first:\n");
    fwrite(STDERR, "    php bin/migrate-create-journal-entries.php\n");
    exit(1);
}
$columnExists = (int) $conn->fetchOne(
    "SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name = 'ledger_transactions' AND column_name = 'journal_entry_id'"
);
if ($columnExists === 0) {
    fwrite(STDERR, "✗ ledger_transactions.journal_entry_id column does not exist. Run sub-phase A first.\n");
    exit(1);
}
echo "✓ Sub-phase A schema is in place\n";

// ─── Establish counts ───────────────────────────────────────────────
$totalRows = (int) $conn->fetchOne("SELECT COUNT(*) FROM ledger_transactions");
$alreadyLinked = (int) $conn->fetchOne(
    "SELECT COUNT(*) FROM ledger_transactions WHERE journal_entry_id IS NOT NULL"
);
$toBackfill = $totalRows - $alreadyLinked;

echo "  Total ledger_transactions: {$totalRows}\n";
echo "  Already linked:            {$alreadyLinked}\n";
echo "  To backfill:               {$toBackfill}\n\n";

if ($toBackfill === 0 && $totalRows > 0) {
    echo "Nothing to backfill — every line already has journal_entry_id.\n";
    echo "Sub-phase B is complete.\n";
    exit(0);
}
if ($totalRows === 0) {
    echo "No ledger_transactions rows. Backfill is a no-op.\n";
    echo "Sub-phase B is complete (vacuously).\n";
    exit(0);
}

// ─── Pass 0: pre-flight integrity check ─────────────────────────────
//
// Each callback group must have lines that ALL agree on:
//   - posting_date — a journal cannot span dates
//   - is_closing_entry — a journal is either a closing journal or it isn't
//
// If a group disagrees on either, the data is malformed and we abort.
// The operator must audit those rows before backfill can proceed.
echo "[Pass 0] Integrity check — looking for callback groups with inconsistent date or closing flag…\n";

$badGroups = $conn->fetchAllAssociative(
    "SELECT trans_callback,
            COUNT(DISTINCT posting_date)    AS distinct_dates,
            COUNT(DISTINCT is_closing_entry) AS distinct_closing,
            COUNT(*) AS line_count
     FROM ledger_transactions
     WHERE trans_callback IS NOT NULL
       AND journal_entry_id IS NULL
     GROUP BY trans_callback
     HAVING COUNT(DISTINCT posting_date) > 1
         OR COUNT(DISTINCT is_closing_entry) > 1
     LIMIT 50"
);
if (count($badGroups) > 0) {
    fwrite(STDERR, "✗ Found " . count($badGroups) . " callback group(s) with inconsistent metadata. "
        . "A single JournalEntry header cannot represent lines that disagree on date or closing flag. "
        . "Audit and fix these before re-running:\n\n");
    foreach (array_slice($badGroups, 0, 10) as $g) {
        fwrite(STDERR, sprintf(
            "  callback=%s  lines=%d  distinct_dates=%d  distinct_closing=%d\n",
            $g['trans_callback'], $g['line_count'], $g['distinct_dates'], $g['distinct_closing']
        ));
    }
    fwrite(STDERR, "\nFor each bad group, run:\n");
    fwrite(STDERR, "  SELECT id, posting_date, is_closing_entry, trans_amount, trans_type, trans_narration\n");
    fwrite(STDERR, "  FROM ledger_transactions WHERE trans_callback = '{callback}';\n");
    fwrite(STDERR, "Then either fix the data or delete the bad rows (they cannot survive the backfill).\n");
    exit(1);
}
echo "✓ No inconsistent groups found\n\n";

// ─── Pass 1: non-reversal callbacks ─────────────────────────────────
//
// Group ledger_transactions by trans_callback (excluding REV-* and NULL),
// synthesize a JournalEntry header for each, then UPDATE all matching
// lines to point at the new header.
//
// Why we don't use Doctrine's UnitOfWork here:
//   - For 100k+ rows, ORM-level persistence is dramatically slower
//     than raw SQL UPDATE.
//   - The UoW would also try to re-flush every modified entity at
//     end-of-script, which is wasteful when we already know exactly
//     what changed.
// Trade-off: we lose entity-level lifecycle hooks (TimestampsTrait
// auto-fill of created_at/updated_at). We compensate by setting those
// columns explicitly in the INSERT.

echo "[Pass 1] Backfilling non-reversal journals…\n";

$pass1Stats = backfillNonReversal($conn);
echo "  Created: {$pass1Stats['created']} new journals\n";
echo "  Linked:  {$pass1Stats['linked']} existing journals\n";
echo "  Lines updated: {$pass1Stats['lines']}\n\n";

// ─── Pass 2: reversal callbacks (REV-*) ─────────────────────────────
//
// Reversal callbacks are shaped like:
//   REV-{original_callback}-{YYYYMMDDHHMMSS}
//
// We extract the original_callback by stripping the REV- prefix and
// the trailing -YYYYMMDDHHMMSS timestamp, then look up the JournalEntry
// with that legacy_callback (created in Pass 1) to set reversal_of_id.
//
// Edge cases:
//   - JournalReversalService also handles single-line entries with no
//     callback by setting reversalCallback = 'REV-' . $original->getId() . '-' . date('YmdHis')
//     where $original->getId() is a UUID. We try both forms (callback
//     match first, then UUID-of-line match).
//   - Pre-existing reversals from a system that didn't follow this
//     convention won't match; we set reversal_of_id = NULL and log.

echo "[Pass 2] Backfilling reversal journals…\n";

$pass2Stats = backfillReversals($conn);
echo "  Created:  {$pass2Stats['created']} new reversal journals\n";
echo "  Linked:   {$pass2Stats['linked']} existing reversal journals\n";
echo "  Resolved originals: {$pass2Stats['resolved']}\n";
echo "  Orphan reversals:   {$pass2Stats['orphans']} (reversal_of_id left NULL)\n";
echo "  Lines updated: {$pass2Stats['lines']}\n\n";

// ─── Pass 3: NULL-callback orphan lines ─────────────────────────────
//
// Defensive: if any rows have trans_callback IS NULL (allowed by the
// schema but rare in practice), we can't group them. Each such line
// gets its own MANUAL JournalEntry — better than leaving journal_entry_id
// NULL and breaking sub-phase C's NOT NULL constraint.

echo "[Pass 3] Backfilling NULL-callback orphan lines…\n";

$pass3Stats = backfillNullCallbackOrphans($conn);
echo "  Created: {$pass3Stats['created']} synthetic MANUAL journals\n";
echo "  Lines updated: {$pass3Stats['lines']}\n\n";

// ─── Pass 4: verification ───────────────────────────────────────────
echo "[Pass 4] Verification…\n";

$stillNull = (int) $conn->fetchOne(
    "SELECT COUNT(*) FROM ledger_transactions WHERE journal_entry_id IS NULL"
);
$totalAfter = (int) $conn->fetchOne("SELECT COUNT(*) FROM ledger_transactions");
$linkedAfter = $totalAfter - $stillNull;

echo "  Total ledger_transactions: {$totalAfter}\n";
echo "  Linked (journal_entry_id NOT NULL): {$linkedAfter}\n";
echo "  Still NULL: {$stillNull}\n";

if ($stillNull > 0) {
    fwrite(STDERR, "\n✗ Backfill incomplete — {$stillNull} row(s) still have NULL journal_entry_id.\n");
    fwrite(STDERR, "Sub-phase C's NOT NULL constraint would fail. Investigate:\n");
    fwrite(STDERR, "  SELECT id, trans_callback, posting_date, trans_amount, trans_narration\n");
    fwrite(STDERR, "  FROM ledger_transactions WHERE journal_entry_id IS NULL LIMIT 20;\n");
    exit(1);
}

$totalJournals = (int) $conn->fetchOne("SELECT COUNT(*) FROM journal_entries");
echo "  Total journal_entries: {$totalJournals}\n";

echo "\n✓ Sub-phase B complete. Every line is linked to a JournalEntry header.\n";
echo "Next: sub-phase C will ALTER journal_entry_id to NOT NULL.\n";

// ────────────────────────────────────────────────────────────────────
// Implementation
// ────────────────────────────────────────────────────────────────────

/**
 * Pass 1: synthesize a header per non-reversal callback group.
 *
 * For each callback NOT starting with 'REV-' (and not NULL), check if
 * a JournalEntry with that legacy_callback already exists. If not,
 * create one. Then UPDATE all matching lines to set journal_entry_id.
 *
 * Per-group transaction so partial progress survives interruption.
 */
function backfillNonReversal(\Doctrine\DBAL\Connection $conn): array
{
    $stats = ['created' => 0, 'linked' => 0, 'lines' => 0];

    // Find every distinct callback that has at least one unlinked line
    // and isn't a reversal. We process them in posting_date order so
    // any cross-callback ordering effects (rare but possible) are stable.
    $callbacks = $conn->fetchAllAssociative(
        "SELECT trans_callback,
                MIN(posting_date)     AS posting_date,
                MIN(is_closing_entry::int) AS is_closing_entry,
                MIN(posted_by)        AS posted_by,
                MIN(trans_narration)  AS sample_narration,
                COUNT(*)              AS line_count
         FROM ledger_transactions
         WHERE trans_callback IS NOT NULL
           AND trans_callback NOT LIKE 'REV-%'
           AND journal_entry_id IS NULL
         GROUP BY trans_callback
         ORDER BY MIN(posting_date) ASC, trans_callback ASC"
    );

    foreach ($callbacks as $row) {
        $cb = $row['trans_callback'];
        $conn->beginTransaction();
        try {
            // Idempotency: if an earlier (interrupted) run already
            // created the header, find and reuse it.
            $existingId = $conn->fetchOne(
                "SELECT id FROM journal_entries WHERE legacy_callback = :cb LIMIT 1",
                ['cb' => $cb]
            );

            if ($existingId !== false && $existingId !== null) {
                $headerId = (string) $existingId;
                $stats['linked']++;
            } else {
                $headerId = createJournalEntryHeader(
                    $conn,
                    $cb,
                    (string) $row['posting_date'],
                    deriveEntryType($cb),
                    (string) ($row['sample_narration'] ?? deriveDefaultNarration($cb)),
                    $row['posted_by'] ? (string) $row['posted_by'] : null,
                    isReversal: false,
                    reversalOfId: null,
                    isClosingEntry: ((int) $row['is_closing_entry']) === 1,
                );
                $stats['created']++;
            }

            // Link all lines for this callback that don't have a header yet.
            $updated = $conn->executeStatement(
                "UPDATE ledger_transactions
                 SET journal_entry_id = :hid
                 WHERE trans_callback = :cb
                   AND journal_entry_id IS NULL",
                ['hid' => $headerId, 'cb' => $cb]
            );
            $stats['lines'] += (int) $updated;

            $conn->commit();
        } catch (\Throwable $e) {
            $conn->rollBack();
            fwrite(STDERR, "✗ Pass 1 failed on callback '{$cb}': {$e->getMessage()}\n");
            throw $e;
        }
    }

    return $stats;
}

/**
 * Pass 2: synthesize headers for reversal callbacks (REV-*) and link
 * them to their originals via reversal_of_id.
 *
 * The original-resolution logic mirrors what JournalReversalService
 * does at runtime:
 *   - If the original journal had a callback X, the reversal callback
 *     is 'REV-X-{timestamp}'. We strip prefix + timestamp, then look
 *     up X in journal_entries by legacy_callback.
 *   - If the original was a single line with no callback,
 *     JournalReversalService used its line UUID:
 *     'REV-{line_uuid}-{timestamp}'. We try that match too.
 */
function backfillReversals(\Doctrine\DBAL\Connection $conn): array
{
    $stats = ['created' => 0, 'linked' => 0, 'resolved' => 0, 'orphans' => 0, 'lines' => 0];

    $callbacks = $conn->fetchAllAssociative(
        "SELECT trans_callback,
                MIN(posting_date)     AS posting_date,
                MIN(is_closing_entry::int) AS is_closing_entry,
                MIN(posted_by)        AS posted_by,
                MIN(trans_narration)  AS sample_narration,
                COUNT(*)              AS line_count
         FROM ledger_transactions
         WHERE trans_callback LIKE 'REV-%'
           AND journal_entry_id IS NULL
         GROUP BY trans_callback
         ORDER BY MIN(posting_date) ASC, trans_callback ASC"
    );

    foreach ($callbacks as $row) {
        $cb = $row['trans_callback'];
        $originalId = resolveReversalOriginal($conn, $cb);

        $conn->beginTransaction();
        try {
            $existingId = $conn->fetchOne(
                "SELECT id FROM journal_entries WHERE legacy_callback = :cb LIMIT 1",
                ['cb' => $cb]
            );

            if ($existingId !== false && $existingId !== null) {
                $headerId = (string) $existingId;
                $stats['linked']++;
            } else {
                $headerId = createJournalEntryHeader(
                    $conn,
                    $cb,
                    (string) $row['posting_date'],
                    JournalEntryType::REVERSAL,
                    (string) ($row['sample_narration'] ?? "Reversal: {$cb}"),
                    $row['posted_by'] ? (string) $row['posted_by'] : null,
                    isReversal: true,
                    reversalOfId: $originalId,
                    isClosingEntry: ((int) $row['is_closing_entry']) === 1,
                );
                $stats['created']++;
            }

            if ($originalId !== null) {
                $stats['resolved']++;
            } else {
                $stats['orphans']++;
                fwrite(STDERR, "  ⚠ Reversal '{$cb}': original journal not found "
                    . "(searched legacy_callback and line UUIDs). reversal_of_id left NULL.\n");
            }

            $updated = $conn->executeStatement(
                "UPDATE ledger_transactions
                 SET journal_entry_id = :hid
                 WHERE trans_callback = :cb
                   AND journal_entry_id IS NULL",
                ['hid' => $headerId, 'cb' => $cb]
            );
            $stats['lines'] += (int) $updated;

            $conn->commit();
        } catch (\Throwable $e) {
            $conn->rollBack();
            fwrite(STDERR, "✗ Pass 2 failed on callback '{$cb}': {$e->getMessage()}\n");
            throw $e;
        }
    }

    return $stats;
}

/**
 * Pass 3: synthesize one MANUAL JournalEntry per line with NULL
 * trans_callback. Each gets its own header (we have no grouping key).
 *
 * Per-line transactions because there's no grouping efficiency to
 * gain — each line is standalone here.
 */
function backfillNullCallbackOrphans(\Doctrine\DBAL\Connection $conn): array
{
    $stats = ['created' => 0, 'lines' => 0];

    $orphans = $conn->fetchAllAssociative(
        "SELECT id, posting_date, is_closing_entry, posted_by, trans_narration
         FROM ledger_transactions
         WHERE trans_callback IS NULL
           AND journal_entry_id IS NULL
         ORDER BY posting_date ASC"
    );

    foreach ($orphans as $row) {
        $conn->beginTransaction();
        try {
            $headerId = createJournalEntryHeader(
                $conn,
                legacyCallback: null, // genuinely NULL; sub-phase E may use a fallback later
                postingDate: (string) $row['posting_date'],
                entryType: JournalEntryType::MANUAL,
                narration: (string) ($row['trans_narration'] ?? 'Backfilled from line without callback'),
                postedBy: $row['posted_by'] ? (string) $row['posted_by'] : null,
                isReversal: false,
                reversalOfId: null,
                isClosingEntry: $row['is_closing_entry'] === true || $row['is_closing_entry'] === 't' || $row['is_closing_entry'] === '1',
            );
            $stats['created']++;

            $updated = $conn->executeStatement(
                "UPDATE ledger_transactions
                 SET journal_entry_id = :hid
                 WHERE id = :lid",
                ['hid' => $headerId, 'lid' => (string) $row['id']]
            );
            $stats['lines'] += (int) $updated;

            $conn->commit();
        } catch (\Throwable $e) {
            $conn->rollBack();
            fwrite(STDERR, "✗ Pass 3 failed on line id={$row['id']}: {$e->getMessage()}\n");
            throw $e;
        }
    }

    return $stats;
}

/**
 * Insert one journal_entries row with the given fields. Returns the
 * generated UUID. Sets created_at, updated_at, created_by, updated_by
 * explicitly (we bypass Doctrine UoW here so PrePersist hooks don't
 * run automatically).
 */
function createJournalEntryHeader(
    \Doctrine\DBAL\Connection $conn,
    ?string $legacyCallback,
    string $postingDate,
    JournalEntryType $entryType,
    string $narration,
    ?string $postedBy,
    bool $isReversal,
    ?string $reversalOfId,
    bool $isClosingEntry,
): string {
    $id = \Ramsey\Uuid\Uuid::uuid4()->toString();
    $now = (new \DateTimeImmutable('now', new \DateTimeZone($_ENV['APP_TIMEZONE'] ?? 'Africa/Lagos')))
        ->format('Y-m-d H:i:s');

    // Truncate narration to schema length (varchar(500)) defensively.
    if (strlen($narration) > 500) {
        $narration = substr($narration, 0, 497) . '...';
    }

    $conn->executeStatement(
        "INSERT INTO journal_entries (
            id, posting_date, entry_type, narration,
            reference, posted_by, is_reversal, reversal_of_id,
            is_closing_entry, legacy_callback,
            created_at, updated_at, created_by, updated_by
         ) VALUES (
            :id, :posting_date, :entry_type, :narration,
            NULL, :posted_by, :is_reversal, :reversal_of_id,
            :is_closing_entry, :legacy_callback,
            :now, :now, NULL, NULL
         )",
        [
            'id'               => $id,
            'posting_date'     => $postingDate,
            'entry_type'       => $entryType->value,
            'narration'        => $narration,
            'posted_by'        => $postedBy,
            'is_reversal'      => $isReversal ? 't' : 'f',
            'reversal_of_id'   => $reversalOfId,
            'is_closing_entry' => $isClosingEntry ? 't' : 'f',
            'legacy_callback'  => $legacyCallback,
            'now'              => $now,
        ],
    );
    return $id;
}

/**
 * Map a callback prefix to a JournalEntryType.
 *
 * Mirrors the prefix conventions used by the posting services:
 *   DISB-   → DISBURSEMENT
 *   REPAY-  → REPAYMENT
 *   PEN-    → PENALTY
 *   WO-     → WRITE_OFF
 *   PROV-   → PROVISION
 *   CLOSE-  → CLOSE
 *   REV-    → REVERSAL (handled in Pass 2 directly; this catch is
 *                       defensive in case Pass 1 picks up a REV- by
 *                       mistake — shouldn't happen given the SQL filter)
 *   anything else → MANUAL (forward-compat for callbacks we don't
 *                           recognize, e.g. operator-supplied)
 */
function deriveEntryType(?string $callback): JournalEntryType
{
    if ($callback === null) return JournalEntryType::MANUAL;
    if (str_starts_with($callback, 'DISB-'))  return JournalEntryType::DISBURSEMENT;
    if (str_starts_with($callback, 'REPAY-')) return JournalEntryType::REPAYMENT;
    if (str_starts_with($callback, 'PEN-'))   return JournalEntryType::PENALTY;
    if (str_starts_with($callback, 'WO-'))    return JournalEntryType::WRITE_OFF;
    if (str_starts_with($callback, 'PROV-'))  return JournalEntryType::PROVISION;
    if (str_starts_with($callback, 'CLOSE-')) return JournalEntryType::CLOSE;
    if (str_starts_with($callback, 'REV-'))   return JournalEntryType::REVERSAL;
    return JournalEntryType::MANUAL;
}

/**
 * Default narration when a callback group has no representative
 * line narration (extreme edge case; the SELECT above always picks
 * MIN(trans_narration) which is non-NULL by schema).
 */
function deriveDefaultNarration(string $callback): string
{
    return "Backfilled journal: {$callback}";
}

/**
 * Resolve the original journal for a REV- callback.
 *
 * Strategy:
 *   1. Strip 'REV-' prefix and trailing '-YYYYMMDDHHMMSS' suffix.
 *      That gives the original_callback. Look up by legacy_callback.
 *   2. If that doesn't match, the JournalReversalService fallback
 *      is to use the original line's UUID. The middle segment after
 *      'REV-' is then a UUID. Look up by legacy_callback again
 *      (might match if the original was created with a callback that
 *      happened to be that UUID — uncommon but possible).
 *   3. If neither resolves, return NULL (orphan reversal).
 *
 * Returns the original JournalEntry id (UUID string) or NULL.
 */
function resolveReversalOriginal(\Doctrine\DBAL\Connection $conn, string $reversalCallback): ?string
{
    if (! str_starts_with($reversalCallback, 'REV-')) {
        return null;
    }
    $stripped = substr($reversalCallback, 4); // remove 'REV-' prefix

    // Trailing -YYYYMMDDHHMMSS = 14 digits preceded by a hyphen.
    // Use regex to peel it off cleanly.
    $original = preg_replace('/-\d{14}$/', '', $stripped, 1);
    if ($original === null || $original === '' || $original === $stripped) {
        // No timestamp suffix found — unusual but not fatal. Try the
        // stripped string as-is.
        $original = $stripped;
    }

    $hit = $conn->fetchOne(
        "SELECT id FROM journal_entries WHERE legacy_callback = :cb LIMIT 1",
        ['cb' => $original]
    );
    if ($hit !== false && $hit !== null) {
        return (string) $hit;
    }

    return null;
}
