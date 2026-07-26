<?php

declare(strict_types=1);

/**
 * Seed the Accounting Date / End-of-Day framework:
 *
 *   1. Settings   accounting.enforce_accounting_date (default OFF — see below)
 *                 accounting.current_date
 *                 accounting.allow_backdating / .max_backdate_days
 *                 accounting.require_approval_backdated
 *                 accounting.allow_reopen_closed / .allow_weekend_posting
 *   2. Permissions accounting.post_current / .backdate / .override_date
 *                  .reopen_period / .run_eod
 *                  granted to super_admin, and the posting ones to accountant.
 *   3. Calendar    today's business date, OPEN, as the starting accounting date.
 *
 * ENFORCEMENT IS OFF BY DEFAULT. With it off nothing changes: postings keep
 * taking the date the caller supplies and only the existing monthly period
 * guard applies. That is deliberate — the framework can be deployed, the
 * calendar inspected and permissions assigned before anyone's posting starts
 * being refused. Turn it on from Settings (or here with --enforce) once roles
 * are configured.
 *
 * Idempotent. Usage:
 *   php bin/seed-accounting-date.php                 # dry-run
 *   php bin/seed-accounting-date.php --apply
 *   php bin/seed-accounting-date.php --apply --enforce
 *   php bin/seed-accounting-date.php --apply --date=2026-07-24
 */

require __DIR__ . '/../vendor/autoload.php';

Dotenv\Dotenv::createImmutable(__DIR__ . '/..')->load();

$conn = \Doctrine\DBAL\DriverManager::getConnection([
    'driver'   => $_ENV['DB_DRIVER'] ?? 'pdo_pgsql',
    'host'     => $_ENV['DB_HOST'] ?? '127.0.0.1',
    'port'     => (int) ($_ENV['DB_PORT'] ?? 5432),
    'dbname'   => $_ENV['DB_NAME'] ?? 'creditx',
    'user'     => $_ENV['DB_USER'] ?? 'creditx_user',
    'password' => $_ENV['DB_PASSWORD'] ?? '',
]);

$args    = $argv ?? [];
$apply   = in_array('--apply', $args, true);
$enforce = in_array('--enforce', $args, true);
$now     = (new DateTimeImmutable())->format('Y-m-d H:i:s');
$uuid    = fn() => \Ramsey\Uuid\Uuid::uuid4()->toString();

$startDate = date('Y-m-d');
foreach ($args as $a) {
    if (str_starts_with($a, '--date=')) $startDate = substr($a, 7);
}
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $startDate)) {
    fwrite(STDERR, "Invalid --date: expected YYYY-MM-DD.\n");
    exit(2);
}

// ── Settings ────────────────────────────────────────────────────────────────
$settings = [
    ['accounting.enforce_accounting_date', $enforce ? 'true' : 'false', 'boolean',
     'Enforce the accounting-date framework. OFF keeps legacy behaviour (caller supplies the date).'],
    ['accounting.current_date', $startDate, 'string',
     'Current Accounting Date — the default posting date for every financial module. Advanced by End-of-Day.'],
    ['accounting.allow_backdating', 'true', 'boolean',
     'Allow posting to a previous accounting date that is still open.'],
    ['accounting.max_backdate_days', '1', 'integer',
     'How many days before the current accounting date a backdated posting may target.'],
    ['accounting.require_approval_backdated', 'false', 'boolean',
     'Hold backdated postings for manager approval before they reach the ledger.'],
    ['accounting.allow_reopen_closed', 'true', 'boolean',
     'Allow a closed accounting date to be reopened by an authorised user.'],
    ['accounting.allow_weekend_posting', 'true', 'boolean',
     'Allow postings dated on a Saturday or Sunday.'],
];

echo "== Settings ==\n";
$toInsert = [];
foreach ($settings as $row) {
    if ($conn->fetchOne('SELECT id FROM system_settings WHERE setting_key = ?', [$row[0]])) {
        echo "  exists: {$row[0]}\n";
        continue;
    }
    $toInsert[] = $row;
    echo "  + {$row[0]} = {$row[1]}\n";
}

// ── Permissions ─────────────────────────────────────────────────────────────
$perms = [
    ['accounting.post_current',  'Post to the Current Accounting Date'],
    ['accounting.backdate',      'Post to a Previous Open Accounting Date'],
    ['accounting.override_date', 'Override the Posting Date'],
    ['accounting.reopen_period', 'Reopen a Closed Accounting Period'],
    ['accounting.run_eod',       'Run End-of-Day'],
];

echo "== Permissions ==\n";
$permsToInsert = [];
$permIds = [];
foreach ($perms as [$slug, $name]) {
    $id = $conn->fetchOne('SELECT id FROM permissions WHERE slug = ?', [$slug]);
    if ($id !== false) { $permIds[$slug] = $id; echo "  exists: {$slug}\n"; continue; }
    $permsToInsert[] = [$slug, $name];
    echo "  + {$slug}\n";
}

// ── Calendar bootstrap ──────────────────────────────────────────────────────
echo "== Calendar ==\n";
$hasRow = $conn->fetchOne('SELECT id FROM accounting_calendar WHERE business_date = ?', [$startDate]);
echo $hasRow ? "  exists: {$startDate}\n" : "  + {$startDate} OPEN (starting accounting date)\n";
echo '  enforcement: ' . ($enforce ? 'ON' : 'OFF (legacy behaviour preserved)') . "\n";

if (!$apply) {
    echo "\nDry-run. Re-run with --apply.\n";
    exit(0);
}

// ── Apply ───────────────────────────────────────────────────────────────────
foreach ($toInsert as [$key, $value, $type, $desc]) {
    $conn->insert('system_settings', [
        'id' => $uuid(), 'setting_key' => $key, 'setting_value' => $value, 'type' => $type,
        'category' => 'general', 'description' => $desc, 'is_encrypted' => 'false',
        'created_at' => $now, 'updated_at' => $now,
    ]);
    echo "  inserted setting: {$key}\n";
}
if ($enforce) {
    $conn->update('system_settings', ['setting_value' => 'true', 'updated_at' => $now],
        ['setting_key' => 'accounting.enforce_accounting_date']);
    echo "  enforcement switched ON\n";
}

foreach ($permsToInsert as [$slug, $name]) {
    $id = $uuid();
    $conn->insert('permissions', [
        'id' => $id, 'slug' => $slug, 'name' => $name, 'module' => 'accounting',
        'description' => $name, 'created_at' => $now, 'updated_at' => $now,
    ]);
    $permIds[$slug] = $id;
    echo "  inserted permission: {$slug}\n";
}

// super_admin gets everything; accountant gets the day-to-day posting rights
// but NOT reopen/EOD, which stay a deliberate escalation.
$grants = [
    'super_admin' => array_keys($permIds),
    'accountant'  => ['accounting.post_current', 'accounting.backdate'],
];
foreach ($grants as $roleSlug => $slugs) {
    $roleId = $conn->fetchOne('SELECT id FROM roles WHERE slug = ?', [$roleSlug]);
    if (!$roleId) continue;
    foreach ($slugs as $slug) {
        if (!isset($permIds[$slug])) continue;
        $has = $conn->fetchOne('SELECT 1 FROM role_permissions WHERE role_id = ? AND permission_id = ?', [$roleId, $permIds[$slug]]);
        if (!$has) {
            $conn->insert('role_permissions', ['role_id' => $roleId, 'permission_id' => $permIds[$slug]]);
            echo "  granted {$slug} to {$roleSlug}\n";
        }
    }
}

if (!$hasRow) {
    $conn->insert('accounting_calendar', [
        'id' => $uuid(), 'business_date' => $startDate, 'status' => 'open',
        'opened_at' => $now, 'reopen_count' => 0,
        'created_at' => $now, 'updated_at' => $now,
    ]);
    echo "  opened business date: {$startDate}\n";
}

echo "\nDone. Assign the accounting.* permissions to your roles, confirm the\n";
echo "calendar under Accounting → Accounting Period, then enable enforcement.\n";
