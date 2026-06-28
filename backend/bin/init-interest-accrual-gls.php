<?php

declare(strict_types=1);

/**
 * CreditX — Accrual-interest GL backfill: INTRECV / INTSUSP
 *
 * Backfills the two GL accounts the accrual-basis loan-interest engine
 * depends on:
 *
 *   INTRECV  Asset  Interest Receivable — accrued but uncollected loan
 *                   interest recognised on an accrual basis.
 *   INTSUSP  Asset  Interest in Suspense — accrued interest on
 *                   non-performing loans NOT taken to income (CR-normal
 *                   contra-asset; nets INTRECV down to the collectible
 *                   portion on the balance sheet).
 *
 * Without these, RepaymentService falls back to pure cash-basis interest
 * recognition (CR Interest Income at collection) and the accrual run is
 * a no-op. With them present, interest is recognised over time and the
 * receivable is cleared as repayments come in.
 *
 * Run once on upgrade:
 *   php bin/init-interest-accrual-gls.php
 *
 * Idempotent — checks accountCode (and accountNumber) before inserting,
 * so re-running is a no-op.
 */

require __DIR__ . '/../vendor/autoload.php';

if (file_exists(__DIR__ . '/../.env')) {
    $dotenv = \Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
    $dotenv->load();
}

use App\Domain\Entity\GeneralLedger;
use App\Domain\Enum\AccountType;
use App\Domain\Enum\LedgerType;

echo "=== CreditX interest-accrual GL backfill ===\n\n";

$em = \App\Infrastructure\Persistence\DoctrineEntityManagerFactory::create();

$gls = [
    // [name, account_number, account_code, type, ledger_type, description]
    ['Interest Receivable', '1011', 'INTRECV', AccountType::ASSET, LedgerType::GENERAL,
     'Accrued but uncollected loan interest (accrual basis)'],
    ['Interest in Suspense', '1012', 'INTSUSP', AccountType::ASSET, LedgerType::GENERAL,
     'Contra-asset; accrued interest on non-performing loans not taken to income (CR-normal)'],
];

$repo = $em->getRepository(GeneralLedger::class);
$inserted = 0;
$skipped = 0;

foreach ($gls as [$name, $number, $code, $type, $ledgerType, $desc]) {
    $existing = $repo->findOneBy(['accountCode' => $code]);
    if ($existing !== null) {
        echo "  ✓ {$code} already exists (\"{$existing->getAccountName()}\") — skipping\n";
        $skipped++;
        continue;
    }
    $byNumber = $repo->findOneBy(['accountNumber' => $number]);
    if ($byNumber !== null) {
        echo "  ! Account number {$number} is taken by \"{$byNumber->getAccountName()}\" "
           . "(code {$byNumber->getAccountCode()}). Skipping {$code} — add it manually with a different number.\n";
        $skipped++;
        continue;
    }

    $gl = new GeneralLedger();
    $gl->setAccountName($name);
    $gl->setAccountNumber($number);
    $gl->setAccountCode($code);
    $gl->setAccountType($type);
    $gl->setLedgerType($ledgerType);
    $gl->setDescription($desc);
    $em->persist($gl);
    echo "  + Created {$code}: {$name} ({$type->value}) #{$number}\n";
    $inserted++;
}

if ($inserted > 0) {
    $em->flush();
}

echo "\nDone. Inserted: {$inserted}, skipped: {$skipped}.\n";
