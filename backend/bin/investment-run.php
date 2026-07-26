<?php

declare(strict_types=1);

/**
 * CreditX — scheduled investment job: accrue interest, then settle maturities.
 *
 * Accrual recognises interest at every period boundary reached on or before the
 * run date, per each investment's payout mode (build the liability, pay the
 * investor, or capitalise) with withholding tax deducted whenever interest is
 * credited. Maturity then settles every fixed-term investment that has come due,
 * rolling over the ones flagged for it.
 *
 * Both use the "Default Investment Settlement" account from the Default Ledgers
 * page (falls back to BANK) — a cron has no operator to pick one.
 *
 * Usage:
 *   php bin/investment-run.php                  # accrue + mature, as of today
 *   php bin/investment-run.php --as-of=2026-07-31
 *   php bin/investment-run.php --preview        # accrual preview only, posts nothing
 *   php bin/investment-run.php --accrual-only
 *   php bin/investment-run.php --maturity-only
 *
 * Schedule daily (aaPanel cron), e.g. 01:00. Safe to re-run: accrual only posts
 * period boundaries not yet passed, and a settled investment is no longer due.
 *
 * Requires bin/seed-investments.php to have been run once (INVLIAB / INVINTEXP /
 * WHTPAY); without those the job exits non-zero with a clear message.
 */

require __DIR__ . '/../vendor/autoload.php';

if (file_exists(__DIR__ . '/../.env')) {
    \Dotenv\Dotenv::createImmutable(__DIR__ . '/..')->load();
}

$builder = new \DI\ContainerBuilder();
$builder->addDefinitions(require __DIR__ . '/../config/container.php');
$dic = $builder->build();

// Scheduled job: declare a trusted system actor so accounting-date rules
// allow the dates this job computes for itself (period ends, maturity dates)
// rather than treating them as an unauthenticated backdating attempt.
\App\Infrastructure\Service\PostingContextRegistry::setSystem(basename(__FILE__));

/** @var \App\Infrastructure\Service\InvestmentService $service */
$service = $dic->get(\App\Infrastructure\Service\InvestmentService::class);
/** @var \App\Infrastructure\Service\GlMappingService $mapping */
$mapping = $dic->get(\App\Infrastructure\Service\GlMappingService::class);

$args = $argv ?? [];
$preview      = in_array('--preview', $args, true);
$accrualOnly  = in_array('--accrual-only', $args, true);
$maturityOnly = in_array('--maturity-only', $args, true);

$asOf = date('Y-m-d');
foreach ($args as $a) {
    if (str_starts_with($a, '--as-of=')) {
        $asOf = substr($a, 8);
    }
}
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $asOf)) {
    fwrite(STDERR, "Invalid --as-of: expected YYYY-MM-DD.\n");
    exit(2);
}

$log = fn(string $m) => print('[' . date('Y-m-d H:i:s') . '] ' . $m . "\n");

// Resolve the settlement account up front so a misconfiguration fails before
// anything posts, with a message that says exactly what to fix.
try {
    $settlementGl = $mapping->resolveOrFail(\App\Infrastructure\Service\GlMappingRegistry::INVESTMENT_SETTLEMENT);
} catch (\Throwable $e) {
    fwrite(STDERR, 'Settlement account unresolved: ' . $e->getMessage() . "\n");
    fwrite(STDERR, "Set it under Accounting → Default Ledgers, or seed a BANK GL.\n");
    exit(1);
}

$log("Investment run — as of {$asOf}" . ($preview ? ' (preview)' : '') . ', settling via ' . $settlementGl->getAccountCode());

$exit = 0;

// ── Interest accrual ────────────────────────────────────────────────────────
if (!$maturityOnly) {
    try {
        $r = $service->accrueAll($asOf, $settlementGl->getId(), null, $preview);
        $log(sprintf(
            '  Accrual: %d investment(s), %d period(s) — gross %s, WHT %s, net %s%s',
            $r['investments'], $r['periods'], $r['gross'], $r['wht'], $r['net'],
            $preview ? '  (preview — nothing posted)' : '',
        ));
    } catch (\Throwable $e) {
        // accrueAll is all-or-nothing and names the offending investment.
        fwrite(STDERR, '  ACCRUAL FAILED: ' . $e->getMessage() . "\n");
        $exit = 1;
    }
}

// ── Maturities ──────────────────────────────────────────────────────────────
if (!$accrualOnly && !$preview && $exit === 0) {
    try {
        $m = $service->processMaturities($asOf, null, $settlementGl->getId());
        $log(sprintf(
            '  Maturity: %d due — %d matured, %d rolled over, %d failed, paid out %s',
            $m['due'], $m['matured'], $m['rolled_over'], $m['failed'], $m['paid_out'],
        ));
        foreach ($m['lines'] as $line) {
            if (isset($line['error'])) {
                fwrite(STDERR, "    ! {$line['investment_number']}: {$line['error']}\n");
            } elseif (isset($line['rollover_error'])) {
                fwrite(STDERR, "    ! {$line['investment_number']} matured but rollover failed: {$line['rollover_error']}\n");
            } elseif (!empty($line['rolled_over'])) {
                $log("    {$line['investment_number']} → rolled into {$line['new_investment']} ({$line['reinvested']})");
            }
        }
        if ($m['failed'] > 0) {
            $exit = 1; // surface to cron monitoring
        }
    } catch (\Throwable $e) {
        fwrite(STDERR, '  MATURITY SWEEP FAILED: ' . $e->getMessage() . "\n");
        $exit = 1;
    }
} elseif ($preview && !$accrualOnly) {
    $log('  Maturity: skipped (preview mode posts nothing)');
}

$log($exit === 0 ? '  Done.' : '  Completed with errors.');
exit($exit);
