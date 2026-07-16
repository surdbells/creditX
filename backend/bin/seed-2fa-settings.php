<?php

declare(strict_types=1);

/**
 * Seed the per-app 2FA (email OTP) settings so they appear in the admin
 * Settings UI. Idempotent — existing keys are left untouched.
 *
 * Enforcement is configured independently per app:
 *   2fa.admin_enabled   — admin / back-office users
 *   2fa.agent_enabled   — field agents (DSAs)
 *   2fa.portal_enabled  — customer portal accounts
 *
 * If a per-app key is absent the code falls back to the legacy global
 * `2fa.enabled`, so seeding these keys is what switches a deployment over to
 * per-app control. Each is seeded to the CURRENT effective value of
 * `2fa.enabled` (default false) so behaviour does not change on deploy.
 *
 * Usage:
 *   php bin/seed-2fa-settings.php            # dry-run preview
 *   php bin/seed-2fa-settings.php --apply    # insert missing keys
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

// Preserve current behaviour: default the per-app keys to whatever the legacy
// global flag is set to right now.
$legacy = $conn->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = ?', ['2fa.enabled']);
$current = $legacy !== false && filter_var($legacy, FILTER_VALIDATE_BOOLEAN) ? 'true' : 'false';
echo "Legacy 2fa.enabled = " . ($legacy === false ? '(unset)' : (string) $legacy) . " → seeding per-app keys as '{$current}'\n\n";

$settings = [
    ['2fa.admin_enabled',   $current, 'boolean', 'security', 'Require email OTP at login for admin/back-office users'],
    ['2fa.agent_enabled',   $current, 'boolean', 'security', 'Require email OTP at login for field agents (DSAs)'],
    ['2fa.portal_enabled',  $current, 'boolean', 'security', 'Require email OTP at login for customer portal accounts'],
    ['2fa.otp_ttl_minutes', '10',     'integer', 'security', 'How long an emailed OTP code stays valid (minutes)'],
];

$toInsert = [];
foreach ($settings as [$key, $value, $type, $category, $desc]) {
    $exists = $conn->fetchOne('SELECT id FROM system_settings WHERE setting_key = ?', [$key]);
    if ($exists) {
        echo "  exists, skipping: {$key}\n";
        continue;
    }
    $toInsert[] = [$key, $value, $type, $category, $desc];
}

if (empty($toInsert)) {
    echo "\nNothing to seed — all 2FA settings already present.\n";
    exit(0);
}

echo "\nWill insert " . count($toInsert) . " setting(s):\n";
foreach ($toInsert as [$key, $value]) {
    echo "  + {$key} = {$value}\n";
}

if (!$apply) {
    echo "\nDry-run. Re-run with --apply to insert.\n";
    exit(0);
}

$now = (new DateTimeImmutable())->format('Y-m-d H:i:s');
foreach ($toInsert as [$key, $value, $type, $category, $desc]) {
    $conn->insert('system_settings', [
        'id'            => \Ramsey\Uuid\Uuid::uuid4()->toString(),
        'setting_key'   => $key,
        'setting_value' => $value,
        'type'          => $type,
        'category'      => $category,
        'description'   => $desc,
        'is_encrypted'  => 'false',
        'created_at'    => $now,
        'updated_at'    => $now,
    ]);
    echo "  inserted: {$key}\n";
}
echo "\nDone.\n";
