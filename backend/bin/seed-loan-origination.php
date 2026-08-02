<?php

declare(strict_types=1);

/**
 * Seed the loans.originate permission — back-office loan onboarding.
 *
 * Granted to super_admin ONLY. Originating a loan creates real financial
 * commitments, so who may do it from the back office is a deliberate choice
 * per institution rather than something a deploy decides. Assign it to your
 * branch/operations roles from Settings → Roles.
 *
 * Idempotent. Usage:
 *   php bin/seed-loan-origination.php            # dry-run
 *   php bin/seed-loan-origination.php --apply
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

$apply = in_array('--apply', $argv ?? [], true);
$now = (new DateTimeImmutable())->format('Y-m-d H:i:s');
$uuid = fn() => \Ramsey\Uuid\Uuid::uuid4()->toString();

$slug = 'loans.originate';
$name = 'Originate Loans from the Back Office';

echo "== Permission ==\n";
$permId = $conn->fetchOne('SELECT id FROM permissions WHERE slug = ?', [$slug]);
$need = $permId === false;
echo $need ? "  + {$slug}\n" : "  exists: {$slug}\n";

if (!$apply) {
    echo "\nDry-run. Re-run with --apply.\n";
    exit(0);
}

if ($need) {
    $permId = $uuid();
    $conn->insert('permissions', [
        'id' => $permId, 'slug' => $slug, 'name' => $name, 'module' => 'loans',
        'description' => $name, 'created_at' => $now, 'updated_at' => $now,
    ]);
    echo "  inserted permission: {$slug}\n";
}

$superId = $conn->fetchOne("SELECT id FROM roles WHERE slug = 'super_admin'");
if ($superId && $permId) {
    $has = $conn->fetchOne('SELECT 1 FROM role_permissions WHERE role_id = ? AND permission_id = ?', [$superId, $permId]);
    if (!$has) {
        $conn->insert('role_permissions', ['role_id' => $superId, 'permission_id' => $permId]);
        echo "  granted {$slug} to super_admin\n";
    }
}

echo "\nDone. Assign '{$slug}' to the roles that should originate loans from\n";
echo "the back office (Settings → Roles). Until then only super admins see the\n";
echo "New Loan page.\n";
