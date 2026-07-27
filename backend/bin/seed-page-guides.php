<?php

declare(strict_types=1);

/**
 * Seed the page-guide visibility switch.
 *
 *   ui.page_guides_enabled  (boolean, default true)
 *
 * Controls whether the Walkthrough and Overview affordances appear anywhere in
 * the admin app. Exposed through /api/settings/public because the frontend
 * needs it at boot, before any guided page renders.
 *
 * The frontend defaults to ON when the key is absent, so this seeder is about
 * making the switch VISIBLE and editable in the Settings UI rather than about
 * enabling the feature — guides work either way.
 *
 * Idempotent. Usage:
 *   php bin/seed-page-guides.php            # dry-run
 *   php bin/seed-page-guides.php --apply
 *   php bin/seed-page-guides.php --apply --off   # seed it switched off
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

$args  = $argv ?? [];
$apply = in_array('--apply', $args, true);
$off   = in_array('--off', $args, true);
$value = $off ? 'false' : 'true';
$now   = (new DateTimeImmutable())->format('Y-m-d H:i:s');

$key = 'ui.page_guides_enabled';
$existing = $conn->fetchOne('SELECT id FROM system_settings WHERE setting_key = ?', [$key]);

echo "== Page guide visibility ==\n";
if ($existing) {
    $current = $conn->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = ?', [$key]);
    echo "  exists: {$key} = {$current}\n";
    echo "  (leaving as-is — change it from Settings, not by re-running this)\n";
} else {
    echo "  + {$key} = {$value}\n";
}

if (!$apply) {
    echo "\nDry-run. Re-run with --apply.\n";
    exit(0);
}

if (!$existing) {
    $conn->insert('system_settings', [
        'id'            => \Ramsey\Uuid\Uuid::uuid4()->toString(),
        'setting_key'   => $key,
        'setting_value' => $value,
        'type'          => 'boolean',
        'category'      => 'general',
        'description'   => 'Show the contextual page guides (Walkthrough tour and Overview panel) across the admin app. Turn off to hide them everywhere.',
        'is_encrypted'  => 'false',
        'created_at'    => $now,
        'updated_at'    => $now,
    ]);
    echo "  inserted: {$key} = {$value}\n";
}

echo "\nDone. Toggle it under Settings → General.\n";
