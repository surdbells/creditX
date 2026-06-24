<?php

declare(strict_types=1);

/**
 * CreditX — accounting tie-out healthcheck.
 *
 * Asserts the books are internally consistent. Run on demand, on a
 * schedule, or in CI after a data migration. Exits 0 if everything ties
 * out, 1 if any check fails — so it can gate a deploy or page on-call.
 *
 * Checks:
 *   1. Per-journal balance      — every JournalEntry's lines sum DR==CR
 *   2. Global double-entry      — Σ all debits == Σ all credits
 *   3. Accounting equation      — Assets = Liabilities + Equity + (Income − Expense)
 *   4. Well-formed journals      — every journal has ≥ 2 lines and a header
 *   5. Sub-ledger reconciliation — each CUSTOMER-type GL parent balance
 *                                  equals the sum of its sub-ledger lines
 *
 * Usage:
 *   php bin/accounting-healthcheck.php
 *
 * Read-only — runs SELECTs only, never writes.
 */

require __DIR__ . '/../vendor/autoload.php';

if (file_exists(__DIR__ . '/../.env')) {
    $dotenv = \Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
    $dotenv->load();
}

use App\Domain\Enum\AccountType;
use App\Domain\Enum\LedgerType;

$TOLERANCE = '0.01'; // one kobo — matches LedgerService::BALANCE_TOLERANCE_KOBO

$em = \App\Infrastructure\Persistence\DoctrineEntityManagerFactory::create();
$conn = $em->getConnection();

$failures = [];
$pass = static function (string $msg): void { echo "  \u{2713} {$msg}\n"; };
$fail = function (string $msg) use (&$failures): void {
    echo "  \u{2717} {$msg}\n";
    $failures[] = $msg;
};
$absdiff = static function (string $a, string $b): string {
    $d = bcsub($a, $b, 2);
    return ltrim($d, '-');
};

echo "=== CreditX accounting healthcheck ===\n\n";

// ─── 1. Per-journal balance ──────────────────────────────────────────
echo "[1/5] Per-journal balance (DR == CR within each JournalEntry)\n";
$unbalanced = $conn->fetchAllAssociative(
    "SELECT journal_entry_id,
            SUM(CASE WHEN trans_type = 'DR' THEN CAST(trans_amount AS NUMERIC) ELSE 0 END) AS dr,
            SUM(CASE WHEN trans_type = 'CR' THEN CAST(trans_amount AS NUMERIC) ELSE 0 END) AS cr
       FROM ledger_transactions
      GROUP BY journal_entry_id
     HAVING ABS(SUM(CASE WHEN trans_type = 'DR' THEN CAST(trans_amount AS NUMERIC) ELSE 0 END)
              - SUM(CASE WHEN trans_type = 'CR' THEN CAST(trans_amount AS NUMERIC) ELSE 0 END)) > {$TOLERANCE}"
);
if (count($unbalanced) === 0) {
    $pass('All journals balance.');
} else {
    foreach ($unbalanced as $u) {
        $fail(sprintf('Journal %s is unbalanced: DR=%s CR=%s', $u['journal_entry_id'], $u['dr'], $u['cr']));
    }
}

// ─── 2. Global double-entry ──────────────────────────────────────────
echo "\n[2/5] Global double-entry (Σ debits == Σ credits)\n";
$totals = $conn->fetchAssociative(
    "SELECT
        COALESCE(SUM(CASE WHEN trans_type = 'DR' THEN CAST(trans_amount AS NUMERIC) ELSE 0 END), 0) AS dr,
        COALESCE(SUM(CASE WHEN trans_type = 'CR' THEN CAST(trans_amount AS NUMERIC) ELSE 0 END), 0) AS cr
       FROM ledger_transactions"
);
$gdr = (string) $totals['dr'];
$gcr = (string) $totals['cr'];
if (bccomp($absdiff($gdr, $gcr), $TOLERANCE, 2) <= 0) {
    $pass(sprintf('Debits == Credits (DR=%s, CR=%s).', $gdr, $gcr));
} else {
    $fail(sprintf('Global imbalance: DR=%s, CR=%s, diff=%s.', $gdr, $gcr, bcsub($gdr, $gcr, 2)));
}

// ─── 3. Accounting equation ──────────────────────────────────────────
// Balance per account, signed to its normal side, grouped by type.
//   Assets / Expenses: DR-normal  → balance = DR − CR
//   Liabilities / Equity / Income: CR-normal → balance = CR − DR
echo "\n[3/5] Accounting equation (A = L + E + (Income − Expense))\n";
$byType = $conn->fetchAllAssociative(
    "SELECT g.account_type AS t,
            COALESCE(SUM(CASE WHEN lt.trans_type = 'DR' THEN CAST(lt.trans_amount AS NUMERIC) ELSE 0 END), 0) AS dr,
            COALESCE(SUM(CASE WHEN lt.trans_type = 'CR' THEN CAST(lt.trans_amount AS NUMERIC) ELSE 0 END), 0) AS cr
       FROM ledger_transactions lt
       JOIN general_ledgers g ON g.id = lt.gl_id
      GROUP BY g.account_type"
);
$bal = [
    AccountType::ASSET->value => '0.00',
    AccountType::LIABILITY->value => '0.00',
    AccountType::EQUITY->value => '0.00',
    AccountType::INCOME->value => '0.00',
    AccountType::EXPENSE->value => '0.00',
];
foreach ($byType as $r) {
    $bal[$r['t']] = bcsub((string) $r['dr'], (string) $r['cr'], 2); // DR − CR
}
$assets = $bal[AccountType::ASSET->value];
$expenses = $bal[AccountType::EXPENSE->value];
// Liabilities/Equity/Income are CR-normal → flip sign for a positive balance
$liabilities = bcmul($bal[AccountType::LIABILITY->value], '-1', 2);
$equity = bcmul($bal[AccountType::EQUITY->value], '-1', 2);
$income = bcmul($bal[AccountType::INCOME->value], '-1', 2);

// A = L + E + (Income − Expense). Expenses are DR-normal (positive here),
// so net profit = Income − Expense, and: A − L − E − Income + Expense = 0.
$lhs = $assets;                          // DR − CR for assets
$rhs = bcadd(bcadd($liabilities, $equity, 2), bcsub($income, $expenses, 2), 2);
echo sprintf("      Assets=%s  Liabilities=%s  Equity=%s  Income=%s  Expense=%s\n",
    $assets, $liabilities, $equity, $income, $expenses);
if (bccomp($absdiff($lhs, $rhs), $TOLERANCE, 2) <= 0) {
    $pass(sprintf('Equation holds: Assets %s = L+E+P&L %s.', $lhs, $rhs));
} else {
    $fail(sprintf('Equation broken: Assets %s != L+E+P&L %s (diff %s).', $lhs, $rhs, bcsub($lhs, $rhs, 2)));
}

// ─── 4. Well-formed journals ─────────────────────────────────────────
echo "\n[4/5] Well-formed journals (header present, >= 2 lines)\n";
$orphanLines = (int) $conn->fetchOne(
    'SELECT COUNT(*) FROM ledger_transactions lt
       LEFT JOIN journal_entries je ON je.id = lt.journal_entry_id
      WHERE je.id IS NULL'
);
if ($orphanLines === 0) {
    $pass('Every ledger line has a JournalEntry header.');
} else {
    $fail("{$orphanLines} ledger line(s) have no JournalEntry header.");
}
$singleLine = $conn->fetchAllAssociative(
    'SELECT journal_entry_id, COUNT(*) AS n
       FROM ledger_transactions
      GROUP BY journal_entry_id
     HAVING COUNT(*) < 2'
);
if (count($singleLine) === 0) {
    $pass('Every journal has at least two lines.');
} else {
    foreach ($singleLine as $s) {
        $fail(sprintf('Journal %s has only %s line(s).', $s['journal_entry_id'], $s['n']));
    }
}

// ─── 5. Sub-ledger reconciliation ────────────────────────────────────
// For each CUSTOMER-type GL, the parent GL net balance should equal the
// sum of balances across its customer-ledger lines (which is trivially
// true here since they're the same rows — but a mismatch would indicate
// lines posted to a CUSTOMER GL without a customer_ledger_id, i.e.
// orphan postings the GL reconciliation report flags).
echo "\n[5/5] Sub-ledger integrity (CUSTOMER GLs have no orphan lines)\n";
$customerGls = $conn->fetchAllAssociative(
    'SELECT id, account_code, account_name FROM general_ledgers WHERE ledger_type = :lt',
    ['lt' => LedgerType::CUSTOMER->value]
);
if (count($customerGls) === 0) {
    $pass('No CUSTOMER-type GL accounts to check.');
} else {
    foreach ($customerGls as $g) {
        $orphans = (int) $conn->fetchOne(
            'SELECT COUNT(*) FROM ledger_transactions
              WHERE gl_id = :gl AND customer_ledger_id IS NULL',
            ['gl' => $g['id']]
        );
        if ($orphans === 0) {
            $pass(sprintf('%s (%s): no orphan lines.', $g['account_code'], $g['account_name']));
        } else {
            $fail(sprintf('%s (%s): %d line(s) without a customer ledger — orphan postings.',
                $g['account_code'], $g['account_name'], $orphans));
        }
    }
}

// ─── Verdict ─────────────────────────────────────────────────────────
echo "\n";
if (count($failures) === 0) {
    echo "RESULT: PASS — the books tie out.\n";
    exit(0);
}
echo 'RESULT: FAIL — ' . count($failures) . " issue(s) found:\n";
foreach ($failures as $f) {
    echo "  - {$f}\n";
}
exit(1);
