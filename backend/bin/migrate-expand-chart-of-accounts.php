<?php

declare(strict_types=1);

/**
 * CreditX — Phase 1A: expand the chart of accounts for a full MFB.
 *
 * The original seed only covered the loan-lending side of the GL
 * (loan receivable, interest/fee income, provisioning). A deposit-
 * taking microfinance bank needs the rest of a real chart of accounts:
 * operating expenses, share capital, fixed assets, tax/interest
 * payable, customer deposits, and an opening-balance equity account.
 *
 * This backfills every GL added to bin/seed.php's $glDef that an
 * already-seeded tenant won't have yet.
 *
 *   Assets:      VAULT, PREPAY, FIXASSET, ACCDEP, SUSPENSE
 *   Liabilities: CUSTDEP, INTPAY, TAXPAY, ACCRPAY
 *   Equity:      SHARECAP, STATRES, OBE
 *   Income:      OTHINC
 *   Expense:     SALARY, RENT, UTIL, DEPEXP, INTEXP, BANKCHG, GENADMIN
 *
 * Run once on upgrade:
 *   php bin/migrate-expand-chart-of-accounts.php
 *
 * Idempotent — checks accountCode (and accountNumber) before inserting,
 * so re-running is a no-op. Safe on a tenant that already created any
 * of these accounts manually.
 */

require __DIR__ . '/../vendor/autoload.php';

if (file_exists(__DIR__ . '/../.env')) {
    $dotenv = \Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
    $dotenv->load();
}

use App\Domain\Entity\GeneralLedger;
use App\Domain\Enum\AccountType;
use App\Domain\Enum\LedgerType;

echo "=== CreditX chart-of-accounts expansion ===\n\n";

$em = \App\Infrastructure\Persistence\DoctrineEntityManagerFactory::create();

$newGls = [
    // [name, account_number, account_code, type, ledger_type, description]
    // Assets
    ['Cash in Vault', '1006', 'VAULT', AccountType::ASSET, LedgerType::GENERAL,
     'Physical cash held in branch vaults / tills'],
    ['Prepayments', '1007', 'PREPAY', AccountType::ASSET, LedgerType::GENERAL,
     'Prepaid expenses (rent, insurance, subscriptions)'],
    ['Fixed Assets', '1008', 'FIXASSET', AccountType::ASSET, LedgerType::GENERAL,
     'Property, plant and equipment at cost'],
    ['Accumulated Depreciation', '1009', 'ACCDEP', AccountType::ASSET, LedgerType::GENERAL,
     'Contra-asset; accumulated depreciation on fixed assets (CR-normal)'],
    ['Suspense / Inter-branch', '1010', 'SUSPENSE', AccountType::ASSET, LedgerType::GENERAL,
     'Temporary holding / inter-branch settlement account'],
    // Liabilities
    ['Customer Deposits', '2002', 'CUSTDEP', AccountType::LIABILITY, LedgerType::GENERAL,
     'Customer savings / deposit liabilities (control account; subsidiary ledger is deposit_accounts)'],
    ['Interest Payable on Deposits', '2003', 'INTPAY', AccountType::LIABILITY, LedgerType::GENERAL,
     'Accrued interest owed on customer deposits'],
    ['Tax Payable', '2004', 'TAXPAY', AccountType::LIABILITY, LedgerType::GENERAL,
     'Income / withholding tax payable to authorities'],
    ['Accruals & Other Payables', '2005', 'ACCRPAY', AccountType::LIABILITY, LedgerType::GENERAL,
     'Accrued expenses and sundry payables'],
    // Equity
    ['Share Capital', '3002', 'SHARECAP', AccountType::EQUITY, LedgerType::GENERAL,
     'Paid-up share capital contributed by owners'],
    ['Statutory Reserve', '3003', 'STATRES', AccountType::EQUITY, LedgerType::GENERAL,
     'CBN-mandated statutory reserve appropriation'],
    ['Opening Balance Equity', '3004', 'OBE', AccountType::EQUITY, LedgerType::GENERAL,
     'Contra-equity used to seed opening balances; nets to zero once balanced'],
    // Income
    ['Other Income', '4008', 'OTHINC', AccountType::INCOME, LedgerType::GENERAL,
     'Sundry / miscellaneous income'],
    // Expenses
    ['Salaries & Wages', '5003', 'SALARY', AccountType::EXPENSE, LedgerType::GENERAL,
     'Staff salaries, wages and benefits'],
    ['Rent', '5004', 'RENT', AccountType::EXPENSE, LedgerType::GENERAL,
     'Office and branch rent'],
    ['Utilities', '5005', 'UTIL', AccountType::EXPENSE, LedgerType::GENERAL,
     'Electricity, water, internet and telephony'],
    ['Depreciation Expense', '5006', 'DEPEXP', AccountType::EXPENSE, LedgerType::GENERAL,
     'Periodic depreciation of fixed assets'],
    ['Interest Expense on Deposits', '5007', 'INTEXP', AccountType::EXPENSE, LedgerType::GENERAL,
     'Interest expense accrued on customer deposits'],
    ['Bank Charges', '5008', 'BANKCHG', AccountType::EXPENSE, LedgerType::GENERAL,
     'Bank fees, COT and transaction charges'],
    ['General & Admin Expense', '5009', 'GENADMIN', AccountType::EXPENSE, LedgerType::GENERAL,
     'Sundry general and administrative expenses'],
];

$repo = $em->getRepository(GeneralLedger::class);
$inserted = 0;
$skipped = 0;

foreach ($newGls as [$name, $number, $code, $type, $ledgerType, $desc]) {
    $existing = $repo->findOneBy(['accountCode' => $code]);
    if ($existing !== null) {
        echo "  ✓ {$code} already exists (\"{$existing->getAccountName()}\") — skipping\n";
        $skipped++;
        continue;
    }

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

echo "\nChart-of-accounts expansion done. Inserted: {$inserted}, skipped: {$skipped}.\n";
