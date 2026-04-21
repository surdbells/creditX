<?php

declare(strict_types=1);

/**
 * CreditX — Grant Agent role the 'settings.view' permission
 *
 * Why: the agent mobile app needs to read the 'agent.accepting_loans'
 * setting to know whether to show the 'Applications Paused' screen.
 * That setting is served via GET /api/settings, which is gated by the
 * 'settings.view' RBAC permission. The Agent role was seeded without
 * it, so every agent's GET /settings call returned 403, the Observable
 * error handler swallowed it silently, and the pause toggle had no
 * effect on agents — which is exactly the bug the user reported.
 *
 * This script inserts the role_permissions junction row linking the
 * Agent role to the settings.view permission.
 *
 * Idempotent:
 *   - If Agent role doesn't exist: nothing to do, exits 0
 *   - If settings.view permission doesn't exist: nothing to do, exits 0
 *   - If the junction row already exists: nothing to do, exits 0
 *
 * Safe to re-run on any environment. Future seed runs (fresh DB) already
 * pick up this permission because seed.php will be updated in the same
 * commit to include it — this script is for environments already in
 * production that need a backport.
 *
 * Usage:
 *   php bin/migrate-agent-settings-view.php              # preview
 *   php bin/migrate-agent-settings-view.php --apply       # with prompt
 *   php bin/migrate-agent-settings-view.php --apply --yes # no prompt
 */

require __DIR__ . '/../vendor/autoload.php';

if (file_exists(__DIR__ . '/../.env')) {
    $dotenv = \Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
    $dotenv->load();
}

$args  = $argv ?? [];
$apply = in_array('--apply', $args, true);
$yes   = in_array('--yes', $args, true);

echo "============================================================\n";
echo " CreditX — grant Agent role settings.view permission\n";
echo "============================================================\n";
echo " Mode: " . ($apply ? 'APPLY' : 'DRY-RUN') . "\n\n";

try {
    $em   = \App\Infrastructure\Persistence\DoctrineEntityManagerFactory::create();
    $conn = $em->getConnection();
} catch (\Throwable $e) {
    fwrite(STDERR, "✘ DB connection failed:\n  " . $e->getMessage() . "\n");
    exit(1);
}

$roleId = $conn->fetchOne("SELECT id FROM roles WHERE slug = 'agent' LIMIT 1");
if (!$roleId) {
    echo "  ✓ No 'agent' role found — nothing to do.\n";
    exit(0);
}
echo "  · Agent role id: {$roleId}\n";

$permId = $conn->fetchOne("SELECT id FROM permissions WHERE slug = 'settings.view' LIMIT 1");
if (!$permId) {
    echo "  ✓ No 'settings.view' permission found — nothing to do.\n";
    exit(0);
}
echo "  · settings.view permission id: {$permId}\n";

$existing = $conn->fetchOne(
    "SELECT 1 FROM role_permissions WHERE role_id = ? AND permission_id = ? LIMIT 1",
    [$roleId, $permId]
);

if ($existing) {
    echo "\n✓ Junction row already exists. Nothing to do.\n";
    exit(0);
}

echo "\nPlanned: INSERT INTO role_permissions (role_id, permission_id) VALUES\n";
echo "           ('{$roleId}', '{$permId}')\n\n";

if (!$apply) {
    echo "Dry-run only. Re-run with --apply.\n";
    exit(0);
}

if (!$yes) {
    echo "Proceed? [y/N]: ";
    $line = trim((string) fgets(STDIN));
    if (strtolower($line) !== 'y' && strtolower($line) !== 'yes') {
        echo "Aborted.\n";
        exit(2);
    }
}

$conn->beginTransaction();
try {
    $conn->insert('role_permissions', [
        'role_id'       => $roleId,
        'permission_id' => $permId,
    ]);
    $conn->commit();
    echo "\n✓ Granted settings.view to Agent role.\n";
    echo "Reload php-fpm so cached RBAC lookups pick up the new permission:\n";
    echo "    sudo systemctl reload php-fpm\n";
    exit(0);
} catch (\Throwable $e) {
    $conn->rollBack();
    fwrite(STDERR, "✘ Insert failed, rolled back:\n  " . $e->getMessage() . "\n");
    exit(1);
}
