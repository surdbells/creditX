<?php

declare(strict_types=1);

/**
 * Seed the settlement.* system settings so they appear (and are editable) in
 * the admin Settings UI. Idempotent — existing keys are left untouched.
 *
 * Usage:
 *   php bin/seed-settlement-settings.php            # dry-run preview
 *   php bin/seed-settlement-settings.php --apply    # insert missing keys
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

$settings = [
    ['settlement.enabled', 'false', 'boolean', 'payment', 'Send disbursed funds to the customer bank account via a payment provider'],
    ['settlement.provider', 'paystack', 'string', 'payment', 'Default settlement provider: paystack or flutterwave'],
    ['settlement.mode', 'immediate', 'string', 'payment', 'Settlement trigger: immediate (send right after disbursement) or maker_checker (queue for approval)'],
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
    echo "Nothing to seed — all settlement settings already present.\n";
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
