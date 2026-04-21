<?php

declare(strict_types=1);

/**
 * CreditX — Data Migration Runner
 *
 * Ships one-shot data migrations that aren't expressible via Doctrine
 * schema:tool:update. Each migration below is:
 *   - Idempotent (re-running finds nothing to do and exits cleanly)
 *   - Transactional (single BEGIN/COMMIT across all migrations)
 *   - Reversible by reasoning about its precondition, not by running
 *     the script backwards
 *
 * ════════════════════════════════════════════════════════════════════
 *  MIGRATION 1 — Percentage values: whole-percent → fraction
 * ════════════════════════════════════════════════════════════════════
 * Affected tables:  product_fees, penalty_rules
 * Precondition:     A row has calculation_type = 'percentage' and
 *                   value >= 1, which indicates admin entered '2' for 2%
 *                   instead of the project's canonical fractional form
 *                   (0.02 for 2%).
 * Action:           UPDATE value = value / 100
 * Post-state:       All percentage rows have value < 1 (fractional form).
 * Safe re-run:      After success, no rows match precondition -> no-op.
 *
 * ════════════════════════════════════════════════════════════════════
 *  MIGRATION 2 — product_fees.effect: populate from fee_type code
 * ════════════════════════════════════════════════════════════════════
 * Affected table:   product_fees
 * Precondition:     A row has effect = 'deducted_from_disbursement' (the
 *                   column default applied to rows created before the
 *                   effect column existed) AND the fee_type.code maps to
 *                   a known 'adds_to_gross' meaning in legacy CreditX:
 *                     AF  (Admin Fee)     -> adds_to_gross
 *                     IF  (Insurance Fee) -> adds_to_gross
 *                     All other fee_type codes stay at the default.
 * Action:           UPDATE product_fees SET effect = 'adds_to_gross'
 * Post-state:       Admin + Insurance fees are flagged as ADDS_TO_GROSS.
 *                   Management, BS, Processing remain DEDUCTED_FROM_DISBURSEMENT
 *                   (legacy-correct behavior for those).
 * Safe re-run:      After success, AF/IF rows already have adds_to_gross
 *                   so they don't match the precondition -> no-op.
 *
 * ════════════════════════════════════════════════════════════════════
 *
 * Usage:
 *   php bin/migrate.php                # dry-run — SHOWS planned changes
 *   php bin/migrate.php --apply        # applies with [y/N] prompt
 *   php bin/migrate.php --apply --yes  # applies without prompt (scripts)
 *
 * Exit codes:
 *   0 — clean (dry-run or successful apply)
 *   1 — DB / Doctrine error; nothing committed
 *   2 — user declined the [y/N] prompt
 */

require __DIR__ . '/../vendor/autoload.php';

if (file_exists(__DIR__ . '/../.env')) {
    $dotenv = \Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
    $dotenv->load();
}

$_ENV['APP_ENV'] = $_ENV['APP_ENV'] ?? 'production';

$args = $argv ?? [];
$apply = in_array('--apply', $args, true);
$yes   = in_array('--yes', $args, true);

echo "================================================================\n";
echo " CreditX migration runner\n";
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

// ═══════════════════════════════════════════════════════════════════
//  Migration 1 — percentage values to fractional form
// ═══════════════════════════════════════════════════════════════════

function planPercentageFix(\Doctrine\DBAL\Connection $conn, string $table): array
{
    $sql = "SELECT id, value FROM {$table} WHERE calculation_type = 'percentage' AND value >= 1 ORDER BY value DESC";
    $rows = $conn->fetchAllAssociative($sql);
    $plan = [];
    foreach ($rows as $r) {
        $before = (string) $r['value'];
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

$mig1Plan = array_merge(
    planPercentageFix($conn, 'product_fees'),
    planPercentageFix($conn, 'penalty_rules'),
);

echo "───────────────────────────────────────────────────────────────\n";
echo " Migration 1: percentage values → fractional (divide by 100)\n";
echo "───────────────────────────────────────────────────────────────\n";

if (count($mig1Plan) === 0) {
    echo "  ✓ Nothing to do. All percentage rows are already fractional.\n";
} else {
    echo "  " . count($mig1Plan) . " row(s) will be changed:\n\n";
    echo sprintf("    %-14s %-38s %-15s -> %-15s\n", 'table', 'id', 'value (before)', 'value (after)');
    echo "    " . str_repeat('-', 86) . "\n";
    foreach ($mig1Plan as $p) {
        echo sprintf("    %-14s %-38s %-15s -> %-15s\n",
            $p['table'], $p['id'], $p['before'], $p['after']);
    }
    echo "    " . str_repeat('-', 86) . "\n";
}
echo "\n";

// ═══════════════════════════════════════════════════════════════════
//  Migration 2 — product_fees.effect from fee_type code
// ═══════════════════════════════════════════════════════════════════

function planEffectBackfill(\Doctrine\DBAL\Connection $conn): array
{
    // Legacy CreditX reference code:
    //   $gross_loan = $app_amount + $admin_fee + $insurance_fee;
    // So Admin (AF) and Insurance (IF) fees should have effect=adds_to_gross.
    // All other fee codes stay at the DB default (deducted_from_disbursement).
    $addsToGrossCodes = ['AF', 'IF'];
    $placeholders = implode(',', array_fill(0, count($addsToGrossCodes), '?'));

    $sql = "
        SELECT pf.id, pf.effect, ft.code AS fee_code, ft.name AS fee_name
          FROM product_fees pf
          JOIN fee_types ft ON ft.id = pf.fee_type_id
         WHERE ft.code IN ({$placeholders})
           AND pf.effect != 'adds_to_gross'
         ORDER BY ft.code, pf.id
    ";
    $rows = $conn->fetchAllAssociative($sql, $addsToGrossCodes);
    $plan = [];
    foreach ($rows as $r) {
        $plan[] = [
            'id'     => $r['id'],
            'code'   => $r['fee_code'],
            'name'   => $r['fee_name'],
            'before' => $r['effect'],
            'after'  => 'adds_to_gross',
        ];
    }
    return $plan;
}

$mig2Plan = planEffectBackfill($conn);

echo "───────────────────────────────────────────────────────────────\n";
echo " Migration 2: product_fees.effect → adds_to_gross (by fee code)\n";
echo "───────────────────────────────────────────────────────────────\n";

if (count($mig2Plan) === 0) {
    echo "  ✓ Nothing to do. All Admin/Insurance fees already have effect=adds_to_gross.\n";
} else {
    echo "  " . count($mig2Plan) . " row(s) will be changed:\n\n";
    echo sprintf("    %-38s %-4s %-20s %-30s -> %-15s\n",
        'product_fee.id', 'code', 'fee name', 'effect (before)', 'effect (after)');
    echo "    " . str_repeat('-', 115) . "\n";
    foreach ($mig2Plan as $p) {
        echo sprintf("    %-38s %-4s %-20s %-30s -> %-15s\n",
            $p['id'], $p['code'], substr($p['name'], 0, 20), $p['before'], $p['after']);
    }
    echo "    " . str_repeat('-', 115) . "\n";
}
echo "\n";

// ═══════════════════════════════════════════════════════════════════
//  Apply (or exit if dry-run)
// ═══════════════════════════════════════════════════════════════════

$totalChanges = count($mig1Plan) + count($mig2Plan);

if ($totalChanges === 0) {
    echo "✓ Nothing to migrate. Database is in the expected state.\n";
    exit(0);
}

if (!$apply) {
    echo "Summary: {$totalChanges} row(s) across 2 migration(s) would change.\n";
    echo "Dry-run only. To apply:\n";
    echo "  php bin/migrate.php --apply\n";
    exit(0);
}

if (!$yes) {
    echo "About to apply {$totalChanges} change(s) across 2 migration(s) in a transaction.\n";
    echo "Proceed? [y/N]: ";
    $line = trim((string) fgets(STDIN));
    if (strtolower($line) !== 'y' && strtolower($line) !== 'yes') {
        echo "Aborted by user.\n";
        exit(2);
    }
}

echo "\nApplying...\n";
$conn->beginTransaction();
try {
    $mig1Count = 0;
    foreach ($mig1Plan as $p) {
        $conn->executeStatement(
            "UPDATE {$p['table']} SET value = :value WHERE id = :id",
            ['value' => $p['after'], 'id' => $p['id']]
        );
        $mig1Count++;
    }
    if ($mig1Count > 0) {
        echo "  ✓ Migration 1: updated {$mig1Count} row(s) (percentage -> fraction)\n";
    }

    $mig2Count = 0;
    foreach ($mig2Plan as $p) {
        $conn->executeStatement(
            "UPDATE product_fees SET effect = :effect WHERE id = :id",
            ['effect' => $p['after'], 'id' => $p['id']]
        );
        $mig2Count++;
    }
    if ($mig2Count > 0) {
        echo "  ✓ Migration 2: updated {$mig2Count} row(s) (effect backfill)\n";
    }

    $conn->commit();
    echo "\n✓ All migrations committed successfully.\n";

    // Post-apply verification
    echo "\nPost-migration verification:\n";
    $rem1a = (int) $conn->fetchOne(
        "SELECT COUNT(*) FROM product_fees WHERE calculation_type='percentage' AND value >= 1"
    );
    $rem1b = (int) $conn->fetchOne(
        "SELECT COUNT(*) FROM penalty_rules WHERE calculation_type='percentage' AND value >= 1"
    );
    $rem1 = $rem1a + $rem1b;
    echo "  " . ($rem1 === 0 ? '✓' : '✘') . " Percentage rows with value >= 1: {$rem1}\n";

    $rem2 = (int) $conn->fetchOne("
        SELECT COUNT(*)
          FROM product_fees pf
          JOIN fee_types ft ON ft.id = pf.fee_type_id
         WHERE ft.code IN ('AF','IF')
           AND pf.effect != 'adds_to_gross'
    ");
    echo "  " . ($rem2 === 0 ? '✓' : '✘') . " Admin/Insurance fees not adds_to_gross: {$rem2}\n";

    echo "\nDone. Safe to re-run anytime — script is idempotent.\n";
    exit(0);
} catch (\Throwable $e) {
    $conn->rollBack();
    fwrite(STDERR, "✘ Migration failed, transaction rolled back:\n  " . $e->getMessage() . "\n");
    exit(1);
}
