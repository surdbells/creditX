<?php

declare(strict_types=1);

/**
 * Seed the FirstCentral credit-bureau settings and the credit_bureau.check
 * permission (granting it to Super Admin). Idempotent — existing rows skipped.
 *
 * Secrets are NOT seeded — they live in backend/.env (FIRSTCENTRAL_*).
 *
 * Usage:
 *   php bin/seed-credit-bureau.php            # dry-run
 *   php bin/seed-credit-bureau.php --apply
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

$settings = [
    ['credit_bureau.enabled', 'false', 'boolean', 'general', 'Enable FirstCentral credit bureau checks'],
    ['credit_bureau.consumer_product_id', '70', 'string', 'general', 'FirstCentral consumer report product id (70 = iScore, returns a numeric score)'],
    ['credit_bureau.commercial_product_id', '47', 'string', 'general', 'FirstCentral commercial report product id (47 = Commercial Full Credit)'],
    ['credit_bureau.pass_threshold', '600', 'integer', 'general', 'Credit-check workflow step auto-approves at or above this score'],
    ['credit_bureau.fail_threshold', '400', 'integer', 'general', 'Credit-check workflow step auto-rejects at or below this score; scores between fail and pass go to a human'],
];

echo "== Settings ==\n";
$settingsToInsert = [];
foreach ($settings as $row) {
    if ($conn->fetchOne('SELECT id FROM system_settings WHERE setting_key = ?', [$row[0]])) {
        echo "  exists: {$row[0]}\n";
        continue;
    }
    $settingsToInsert[] = $row;
    echo "  + {$row[0]} = {$row[1]}\n";
}

echo "== Permission ==\n";
$permCode = 'credit_bureau.check';
$permId = $conn->fetchOne('SELECT id FROM permissions WHERE slug = ?', [$permCode]);
$needPerm = $permId === false;
echo $needPerm ? "  + permission {$permCode}\n" : "  exists: permission {$permCode}\n";

if (!$apply) {
    echo "\nDry-run. Re-run with --apply.\n";
    exit(0);
}

foreach ($settingsToInsert as [$key, $value, $type, $category, $desc]) {
    $conn->insert('system_settings', [
        'id' => $uuid(), 'setting_key' => $key, 'setting_value' => $value, 'type' => $type,
        'category' => $category, 'description' => $desc, 'is_encrypted' => 'false',
        'created_at' => $now, 'updated_at' => $now,
    ]);
    echo "  inserted setting: {$key}\n";
}

if ($needPerm) {
    $permId = $uuid();
    $conn->insert('permissions', [
        'id' => $permId, 'slug' => $permCode, 'name' => 'Run Credit Bureau Checks',
        'module' => 'credit_bureau', 'description' => 'Run Credit Bureau Checks',
        'created_at' => $now, 'updated_at' => $now,
    ]);
    echo "  inserted permission: {$permCode}\n";
}

// Grant to Super Admin so it's usable immediately.
$superId = $conn->fetchOne("SELECT id FROM roles WHERE slug = 'super_admin'");
if ($superId && $permId) {
    $has = $conn->fetchOne('SELECT 1 FROM role_permissions WHERE role_id = ? AND permission_id = ?', [$superId, $permId]);
    if (!$has) {
        $conn->insert('role_permissions', ['role_id' => $superId, 'permission_id' => $permId]);
        echo "  granted {$permCode} to super_admin\n";
    }
}

echo "\nDone. Set FIRSTCENTRAL_* in .env and flip credit_bureau.enabled to use it.\n";
