<?php

declare(strict_types=1);

/**
 * CreditX — monthly loan interest accrual job.
 *
 * Recognises loan interest income on an accrual basis for a period:
 *   DR Interest Receivable / CR Interest Income  (performing loans)
 *   DR Interest Receivable / CR Interest in Suspense  (NPLs, suspended)
 *
 * Usage:
 *   php bin/accrue-loan-interest.php                # accrue PREVIOUS month
 *   php bin/accrue-loan-interest.php 2026 05        # accrue a specific period
 *   php bin/accrue-loan-interest.php --preview      # preview previous month, no posting
 *
 * Schedule (aaPanel cron) on the 1st of each month, e.g. 00:30, to accrue
 * the month that just ended. Idempotent: a period already accrued (POSTED
 * run) is refused — reverse it first to re-accrue.
 *
 * Requires the INTRECV / INTSUSP GL accounts — run
 * bin/init-interest-accrual-gls.php once before the first accrual.
 */

require __DIR__ . '/../vendor/autoload.php';

if (file_exists(__DIR__ . '/../.env')) {
    $dotenv = \Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
    $dotenv->load();
}

$definitions = require __DIR__ . '/../config/container.php';
$builder = new \DI\ContainerBuilder();
$builder->addDefinitions($definitions);
$dic = $builder->build();

// Scheduled job: declare a trusted system actor so accounting-date rules
// allow the dates this job computes for itself (period ends, maturity dates)
// rather than treating them as an unauthenticated backdating attempt.
\App\Infrastructure\Service\PostingContextRegistry::setSystem(basename(__FILE__));

/** @var \App\Infrastructure\Service\InterestAccrualService $service */
$service = $dic->get(\App\Infrastructure\Service\InterestAccrualService::class);

$args = array_values(array_filter($argv ?? [], fn($a) => $a !== ''));
array_shift($args); // drop script name
$preview = in_array('--preview', $args, true);
$args = array_values(array_filter($args, fn($a) => !str_starts_with($a, '--')));

if (count($args) >= 2) {
    $year = $args[0];
    $month = $args[1];
} else {
    // Default: the month that just ended.
    $prev = (new \DateTimeImmutable('first day of this month'))->modify('-1 day');
    $year = $prev->format('Y');
    $month = $prev->format('m');
}

echo '[' . date('Y-m-d H:i:s') . "] Loan interest accrual — {$year}-{$month}" . ($preview ? ' (preview)' : '') . "\n";

try {
    if ($preview) {
        $p = $service->preview($year, $month);
        echo "  Loans: {$p['summary']['loan_count']}\n";
        echo "  Income to recognise: {$p['summary']['total_income']}\n";
        echo "  Suspended (NPL):     {$p['summary']['total_suspended']}\n";
        echo "  Posting date:        {$p['posting_date']}\n";
        echo "  (preview only — nothing posted)\n";
    } else {
        $run = $service->run($year, $month, null, 'Scheduled monthly accrual');
        echo "  Run: {$run->getId()}\n";
        echo "  Loans: {$run->getLoanCount()}\n";
        echo "  Income accrued:  {$run->getTotalIncomeAccrued()}\n";
        echo "  Suspended (NPL): {$run->getTotalSuspended()}\n";
        echo "  Done.\n";
    }
} catch (\Throwable $e) {
    echo '  ERROR: ' . $e->getMessage() . "\n";
    exit(1);
}
