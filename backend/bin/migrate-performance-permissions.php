<?php

declare(strict_types=1);

/**
 * One-shot migration: split reports.performance into three granular
 * permissions (reports.performance.agents, .branches, .products).
 *
 * Run this once on any existing CreditX installation after deploying
 * Phase 2.1. The script is idempotent — re-running it is safe.
 *
 * What it does:
 *   1. Insert the three new permissions if they don't exist.
 *   2. For every role currently holding 'reports.performance', grant
 *      all three new permissions.
 *   3. Delete the old 'reports.performance' permission (cascades to
 *      role_permissions via FK, but we explicitly clean role_permissions
 *      first for drivers that don't cascade).
 *
 * Usage:
 *   cd /www/wwwroot/creditx/backend
 *   php bin/migrate-performance-permissions.php
 *
 * On a fresh install where seed-lite.php was just run, the three new
 * permissions already exist and no role holds the old one, so this
 * script is a no-op. Safe to include in deployment scripts.
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
    'password' => $_ENV['DB_PASSWORD'] ?? 'secret',
    'charset'  => $_ENV['DB_CHARSET'] ?? 'utf8',
]);

$uuid = fn(): string => \Ramsey\Uuid\Uuid::uuid4()->toString();
$now  = fn(): string => (new DateTimeImmutable('now', new DateTimeZone($_ENV['APP_TIMEZONE'] ?? 'Africa/Lagos')))->format('Y-m-d H:i:s');

echo "=== Performance Permissions Migration ===\n\n";

$newPerms = [
    ['reports.performance.agents',   'View Agent Performance Report'],
    ['reports.performance.branches', 'View Branch Performance Report'],
    ['reports.performance.products', 'View Product Performance Report'],
];

// ─── Step 1: insert new permissions if missing ───
echo "[1/3] Ensuring new permissions exist...\n";
$newIds = [];
foreach ($newPerms as [$slug, $name]) {
    $existing = $conn->fetchOne('SELECT id FROM permissions WHERE slug = ?', [$slug]);
    if ($existing) {
        echo "  - {$slug} already exists\n";
        $newIds[$slug] = $existing;
        continue;
    }
    $id = $uuid();
    $conn->insert('permissions', [
        'id'          => $id,
        'slug'        => $slug,
        'name'        => $name,
        'module'      => 'reports',
        'description' => $name,
        'created_at'  => $now(),
        'updated_at'  => $now(),
    ]);
    echo "  + {$slug} created\n";
    $newIds[$slug] = $id;
}

// ─── Step 2: migrate role grants ───
echo "\n[2/3] Migrating role grants...\n";
$oldPermId = $conn->fetchOne('SELECT id FROM permissions WHERE slug = ?', ['reports.performance']);

if (!$oldPermId) {
    echo "  - Old 'reports.performance' permission not found; nothing to migrate\n";
} else {
    $roleIds = $conn->fetchFirstColumn(
        'SELECT role_id FROM role_permissions WHERE permission_id = ?',
        [$oldPermId]
    );

    if (empty($roleIds)) {
        echo "  - No roles currently hold 'reports.performance'; nothing to migrate\n";
    } else {
        echo "  - Found " . count($roleIds) . " role(s) with 'reports.performance'\n";

        foreach ($roleIds as $roleId) {
            foreach ($newIds as $slug => $newPermId) {
                $alreadyGranted = $conn->fetchOne(
                    'SELECT 1 FROM role_permissions WHERE role_id = ? AND permission_id = ?',
                    [$roleId, $newPermId]
                );
                if ($alreadyGranted) {
                    continue;
                }
                $conn->insert('role_permissions', [
                    'role_id'       => $roleId,
                    'permission_id' => $newPermId,
                ]);
            }
        }
        echo "  + Granted all three new permissions to the affected roles\n";
    }
}

// ─── Step 3: delete old permission ───
echo "\n[3/3] Removing obsolete 'reports.performance' permission...\n";
if ($oldPermId) {
    // Explicitly clean role_permissions first for drivers that don't cascade.
    $conn->delete('role_permissions', ['permission_id' => $oldPermId]);
    $conn->delete('permissions',      ['id' => $oldPermId]);
    echo "  + Deleted\n";
} else {
    echo "  - Already absent\n";
}

echo "\n=== Migration complete ===\n";
