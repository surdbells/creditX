<?php

declare(strict_types=1);

/**
 * Seed everything the Investment module needs to run:
 *
 *   1. GL accounts   INVLIAB   Investment Liability            (liability)
 *                    INVINTEXP Investment Interest Expense     (expense)
 *                    WHTPAY    Withholding Tax Payable         (liability)
 *   2. Permissions   investments.view / .create / .transact / .interest,
 *                    granted to super_admin (and to the Accountant role if it
 *                    exists, matching bin/seed.php).
 *
 * Until this runs, every placement fails loudly with "no GL account is
 * configured" — by design, so nothing can post to a missing account.
 *
 * The settlement account is NOT seeded: placements let the operator pick per
 * transaction, and the scheduled jobs use the "Default Investment Settlement"
 * role on the Default Ledgers page, which falls back to BANK.
 *
 * Idempotent — existing rows are skipped, so re-running is safe.
 *
 * Usage:
 *   php bin/seed-investments.php            # dry-run
 *   php bin/seed-investments.php --apply
 */

require __DIR__ . '/../vendor/autoload.php';

$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
$dotenv->load();

$conn = \Doctrine\DBAL\DriverManager::getConnection([
    'driver'   => $_ENV['DB_DRIVER'] ?? 'pdo_pgsql',
    'host'     => $_ENV['DB_HOST'] ?? '127.0.0.1',
    'port'     => (int) ($_ENV['DB_PORT'] ?? 5432),
    'dbname'   => $_ENV['DB_NAME'] ?? 'creditx',
    'user'     => $_ENV['DB_USER'] ?? 'creditx_user',
    'password' => $_ENV['DB_PASSWORD'] ?? '',
]);

$apply = in_array('--apply', $argv ?? [], true);
$now = (new DateTimeImmutable())->format('Y-m-d H:i:s');
$uuid = fn() => \Ramsey\Uuid\Uuid::uuid4()->toString();

// ── GL accounts ─────────────────────────────────────────────────────────────
// [account_name, account_number, account_code, account_type, description]
$gls = [
    ['Investment Liability', '2006', 'INVLIAB', 'liability',
     'Principal and capitalised interest owed to investors'],
    ['Investment Interest Expense', '5010', 'INVINTEXP', 'expense',
     'Interest recognised as it accrues on investments'],
    ['Withholding Tax Payable', '2007', 'WHTPAY', 'liability',
     'Withholding tax deducted from investor interest, pending remittance to FIRS'],
];

echo "== GL accounts ==\n";
$glsToInsert = [];
foreach ($gls as $row) {
    [$name, $number, $code] = $row;
    if ($conn->fetchOne('SELECT id FROM general_ledgers WHERE UPPER(account_code) = ?', [$code])) {
        echo "  exists: {$code}  {$name}\n";
        continue;
    }
    // Account numbers are unique too — bail loudly rather than colliding.
    if ($conn->fetchOne('SELECT id FROM general_ledgers WHERE account_number = ?', [$number])) {
        echo "  !! account number {$number} is already taken (needed for {$code}).\n";
        echo "     Create {$code} manually on the Chart of Accounts with a free number,\n";
        echo "     then point the matching role at it on the Default Ledgers page.\n";
        continue;
    }
    $glsToInsert[] = $row;
    echo "  + {$code}  {$number}  {$name}\n";
}

// ── Permissions ─────────────────────────────────────────────────────────────
$perms = [
    ['investments.view', 'View Investment Products & Investments'],
    ['investments.create', 'Create/Edit Investment Products'],
    ['investments.transact', 'Place, Top Up, Withdraw & Settle Investments'],
    ['investments.interest', 'Run Investment Interest Accrual'],
];

echo "== Permissions ==\n";
$permsToInsert = [];
$permIds = [];
foreach ($perms as [$slug, $name]) {
    $id = $conn->fetchOne('SELECT id FROM permissions WHERE slug = ?', [$slug]);
    if ($id !== false) {
        $permIds[$slug] = $id;
        echo "  exists: {$slug}\n";
        continue;
    }
    $permsToInsert[] = [$slug, $name];
    echo "  + {$slug}\n";
}

if (!$apply) {
    echo "\nDry-run. Re-run with --apply.\n";
    exit(0);
}

// ── Apply ───────────────────────────────────────────────────────────────────
foreach ($glsToInsert as [$name, $number, $code, $type, $desc]) {
    $conn->insert('general_ledgers', [
        'id'             => $uuid(),
        'account_name'   => $name,
        'account_number' => $number,
        'account_code'   => $code,
        'account_type'   => $type,
        'ledger_type'    => 'general',
        'description'    => $desc,
        'is_active'      => 'true',
        'created_at'     => $now,
        'updated_at'     => $now,
    ]);
    echo "  inserted GL: {$code}\n";
}

foreach ($permsToInsert as [$slug, $name]) {
    $id = $uuid();
    $conn->insert('permissions', [
        'id' => $id, 'slug' => $slug, 'name' => $name,
        'module' => 'investments', 'description' => $name,
        'created_at' => $now, 'updated_at' => $now,
    ]);
    $permIds[$slug] = $id;
    echo "  inserted permission: {$slug}\n";
}

// Grant to super_admin (always) and accountant (if present) so the module is
// usable straight away without hand-assigning every permission.
foreach (['super_admin', 'accountant'] as $roleSlug) {
    $roleId = $conn->fetchOne('SELECT id FROM roles WHERE slug = ?', [$roleSlug]);
    if (!$roleId) {
        continue;
    }
    foreach ($permIds as $slug => $permId) {
        $has = $conn->fetchOne('SELECT 1 FROM role_permissions WHERE role_id = ? AND permission_id = ?', [$roleId, $permId]);
        if (!$has) {
            $conn->insert('role_permissions', ['role_id' => $roleId, 'permission_id' => $permId]);
            echo "  granted {$slug} to {$roleSlug}\n";
        }
    }
}

echo "\nDone. Review Accounting → Default Ledgers to confirm the three investment\n";
echo "roles resolve, then create products under Investments → Investment Products.\n";
