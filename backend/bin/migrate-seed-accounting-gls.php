<?php

declare(strict_types=1);

/**
 * CreditX — Phase-1 Accounting Hotfix: seed RE / LLP / ALLOW GLs
 *
 * Backfills three system-required GL accounts that previous seed.php
 * versions didn't include but the accounting services depend on:
 *
 *   RETEARN  Equity   Retained Earnings (used by PeriodCloseService
 *                     when zeroing income/expense at period close)
 *   LLP      Expense  Loan Loss Provision (used by ProvisionService
 *                     for the DR side of provisioning entries)
 *   ALLOW    Asset    Allowance for Loan Losses (CR side of provisioning,
 *                     contra-asset)
 *
 * Without these, the first attempt to close a period or run a provision
 * fails with "GL not found" errors.
 *
 * Run once on upgrade:
 *   php bin/migrate-seed-accounting-gls.php
 *
 * Idempotent — checks accountCode before inserting, so re-running is
 * a no-op. Safe to run on a tenant that already has any/all of these
 * accounts manually created.
 */

require __DIR__ . '/../vendor/autoload.php';

if (file_exists(__DIR__ . '/../.env')) {
    $dotenv = \Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
    $dotenv->load();
}

use App\Domain\Entity\GeneralLedger;
use App\Domain\Enum\AccountType;
use App\Domain\Enum\LedgerType;

echo "=== CreditX accounting GL backfill ===\n\n";

$em = \App\Infrastructure\Persistence\DoctrineEntityManagerFactory::create();

$missingGls = [
    // [name, account_number, account_code, type, ledger_type, description]
    ['Retained Earnings', '3001', 'RETEARN', AccountType::EQUITY, LedgerType::GENERAL,
     'Cumulative net income closed from prior periods'],
    ['Allowance for Loan Losses', '1005', 'ALLOW', AccountType::ASSET, LedgerType::GENERAL,
     'Contra-asset for loan loss provisioning (CR-normal)'],
    ['Loan Loss Provision', '5002', 'LLP', AccountType::EXPENSE, LedgerType::GENERAL,
     'Loan loss provision expense (CBN prudential)'],
];

$repo = $em->getRepository(GeneralLedger::class);
$inserted = 0;
$skipped = 0;

foreach ($missingGls as [$name, $number, $code, $type, $ledgerType, $desc]) {
    // Check by accountCode first (the lookup key used by PeriodCloseService
    // and ProvisionService). If that's present, we're done — even if the
    // accountNumber differs slightly the services don't care.
    $existing = $repo->findOneBy(['accountCode' => $code]);
    if ($existing !== null) {
        echo "  ✓ {$code} already exists (\"{$existing->getAccountName()}\") — skipping\n";
        $skipped++;
        continue;
    }

    // Also check accountNumber to avoid violating the unique constraint
    // on that column. If the operator has manually claimed this number
    // for a different account, we skip and warn rather than fail.
    $byNumber = $repo->findOneBy(['accountNumber' => $number]);
    if ($byNumber !== null) {
        echo "  ! Account number {$number} is taken by \"{$byNumber->getAccountName()}\" "
           . "(code {$byNumber->getAccountCode()}). Skipping {$code} — please add it manually with a different number.\n";
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

echo "\nGL backfill done. Inserted: {$inserted}, skipped: {$skipped}.\n\n";

// ─── Settings backfill ──────────────────────────────────────────
//
// LedgerService.validateBatchBalance reads
// 'accounting.batch_validation_cutoff_at' to grandfather historical
// batches. If the key doesn't exist, the service is permissive
// (returns without throwing), but for explicit grandfathering the
// admin should set this to a timestamp AFTER deployment so future
// batches are validated.

use App\Domain\Entity\SystemSetting;
use App\Domain\Enum\SettingCategory;
use App\Domain\Enum\SettingType;

$settingKey = 'accounting.batch_validation_cutoff_at';
$existingSetting = $em->getRepository(SystemSetting::class)->findOneBy(['key' => $settingKey]);
if ($existingSetting === null) {
    $setting = new SystemSetting();
    $setting->setKey($settingKey);
    // Default to NOW() so the operator gets the strictest behaviour
    // out of the box: only batches created AFTER this migration ran
    // will be validated. Historical ones are grandfathered.
    $setting->setValue((new \DateTimeImmutable())->format(\DateTimeInterface::ATOM));
    $setting->setType(SettingType::STRING);
    $setting->setCategory(SettingCategory::ACCOUNTING);
    $setting->setDescription(
        'ISO timestamp; ledger batches whose oldest row predates this cutoff '
      . 'are exempt from balance validation. Auto-set to migration run time.'
    );
    $em->persist($setting);
    $em->flush();
    echo "  + Created setting '{$settingKey}' = " . $setting->getValue() . "\n";
} else {
    echo "  ✓ Setting '{$settingKey}' already exists — skipping\n";
}

echo "\nDone.\n";
