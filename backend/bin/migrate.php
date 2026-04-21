<?php

declare(strict_types=1);

/**
 * CreditX — Data Migration: Percentage to Fraction
 *
 * One-shot migration that corrects historic bad data where percentage
 * fees/penalties were entered as whole-percent literals (e.g. 2.0 meaning
 * 2%) instead of the project's canonical fractional form (0.02 meaning 2%).
 *
 * Affects:
 *   - product_fees.value  WHERE calculation_type = 'percentage'
 *   - penalty_rules.value WHERE calculation_type = 'percentage'
 *
 * Safety strategy — threshold rule:
 *   - Legitimate fractional values are ALWAYS < 1 (a fee > 100% of principal
 *     is not a real business case).
 *   - Percent-literal values are almost always ≥ 1 (a legitimate 0.x% fee
 *     is also rare; if you had one, this script skips it).
 *   - So: dividing rows where value >= 1.0 by 100 is safe — it can only
 *     hit rows where the admin meant a whole-percent and it got stored
 *     as such. Rows already in fractional form (< 1) are untouched.
 *
 * Idempotency:
 *   After a successful run, all percentage rows are < 1. A second run sees
 *   nothing to do. Safe to re-run.
 *
 * Usage:
 *   php bin/migrate.php                # dry-run — SHOWS planned changes, exits
 *   php bin/migrate.php --apply        # applies, with interactive [y/N] confirm
 *   php bin/migrate.php --apply --yes  # applies with no prompt (for scripts)
 *
 * Exit codes:
 *   0 — clean (either dry-run or successful apply)
 *   1 — DB / Doctrine error; nothing was committed
 *   2 — user declined the [y/N] prompt
 */

require __DIR__ . '/../vendor/autoload.php';

if (file_exists(__DIR__ . '/../.env')) {
    $dotenv = \Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
    $dotenv->load();
}

// Force production mode so the EntityManager uses the filesystem cache
// like a normal request would. Not strictly needed for DBAL SQL, but it
// matches how deploy-time CLI tools are expected to behave.
$_ENV['APP_ENV'] = $_ENV['APP_ENV'] ?? 'production';

$args = $argv ?? [];
$apply = in_array('--apply', $args, true);
$yes   = in_array('--yes', $args, true);

echo "================================================================\n";
echo " CreditX migration — percentage fees/penalties -> fraction form\n";
echo "================================================================\n";
echo " Mode: " . ($apply ? "APPLY (will mutate DB)" : "DRY-RUN (read-only)") . "\n";
echo "\n";

try {
    $em = \App\Infrastructure\Persistence\DoctrineEntityManagerFactory::create();
    $conn = $em->getConnection();
} catch (\Throwable $e) {
    fwrite(STDERR, "✘ Could not connect to the database:\n  " . $e->getMessage() . "\n");
    exit(1);
}

/**
 * Query rows that would be affected by the migration and print a
 * before/after summary. Returns a list of [table, id, value_before, value_after]
 * tuples for the actual UPDATE step.
 */
function planMigration(\Doctrine\DBAL\Connection $conn, string $table): array
{
    // Using the same SELECT shape for both tables — they both have
    // id (uuid), value (decimal), calculation_type (varchar).
    $sql = "SELECT id, value FROM {$table} WHERE calculation_type = 'percentage' AND value >= 1 ORDER BY value DESC";
    $rows = $conn->fetchAllAssociative($sql);
    $plan = [];
    foreach ($rows as $r) {
        $before = (string) $r['value'];
        // bcdiv preserves decimal precision — important for money.
        // 6 decimal places matches the column precision (scale=6).
        $after = bcdiv($before, '100', 6);
        $plan[] = [
            'table'  => $table,
            'id'     => $r['id'],
            'before' => $before,
            'after'  => $after,
        ];
    }
    return $plan;
}

$feesPlan     = planMigration($conn, 'product_fees');
$penaltiesPlan = planMigration($conn, 'penalty_rules');
$allPlan = array_merge($feesPlan, $penaltiesPlan);

if (count($allPlan) === 0) {
    echo "✓ Nothing to migrate. All percentage rows are already in fractional form.\n";
    echo "  (No row in product_fees or penalty_rules has value >= 1 with type='percentage'.)\n";
    exit(0);
}

// Print the plan
echo "Plan — " . count($allPlan) . " row(s) will be changed:\n";
echo "  " . str_repeat('-', 86) . "\n";
echo sprintf("  %-14s %-38s %-15s -> %-15s\n", 'table', 'id', 'value (before)', 'value (after)');
echo "  " . str_repeat('-', 86) . "\n";
foreach ($allPlan as $p) {
    echo sprintf("  %-14s %-38s %-15s -> %-15s\n",
        $p['table'], $p['id'], $p['before'], $p['after']);
}
echo "  " . str_repeat('-', 86) . "\n";
echo "\n";

if (!$apply) {
    echo "Dry-run only. To apply these changes, re-run with:\n";
    echo "  php bin/migrate.php --apply\n";
    exit(0);
}

// Interactive confirmation unless --yes given
if (!$yes) {
    echo "About to apply these changes in a transaction. This cannot be undone\n";
    echo "by re-running the script — values < 1 are never touched.\n";
    echo "Proceed? [y/N]: ";
    $line = trim((string) fgets(STDIN));
    if (strtolower($line) !== 'y' && strtolower($line) !== 'yes') {
        echo "Aborted by user.\n";
        exit(2);
    }
}

// Apply in a single transaction — if anything fails, nothing changes.
echo "\nApplying...\n";
$conn->beginTransaction();
try {
    $updated = 0;
    foreach ($allPlan as $p) {
        $conn->executeStatement(
            "UPDATE {$p['table']} SET value = :value WHERE id = :id",
            ['value' => $p['after'], 'id' => $p['id']]
        );
        $updated++;
    }
    $conn->commit();
    echo "✓ Committed — {$updated} row(s) updated across product_fees + penalty_rules.\n";
    echo "\n";
    echo "Post-migration verification:\n";
    foreach ($allPlan as $p) {
        $current = $conn->fetchOne("SELECT value FROM {$p['table']} WHERE id = ?", [$p['id']]);
        $ok = bccomp((string) $current, $p['after'], 6) === 0 ? '✓' : '✘';
        echo "  {$ok} {$p['table']} {$p['id']}: {$current}\n";
    }
    echo "\nDone. Future admin inputs (using the updated form with fraction hints) will\n";
    echo "go straight into the DB in the correct form. This script is idempotent —\n";
    echo "re-running it after today will find nothing to do and exit cleanly.\n";
    exit(0);
} catch (\Throwable $e) {
    $conn->rollBack();
    fwrite(STDERR, "✘ Migration failed, transaction rolled back:\n  " . $e->getMessage() . "\n");
    exit(1);
}
