<?php

declare(strict_types=1);

/**
 * CreditX — channel_members DDL migration
 *
 * Adds four new columns to the channel_members table:
 *
 *   last_read_at  TIMESTAMP NULL
 *   is_muted      BOOLEAN   NOT NULL DEFAULT FALSE
 *   is_pinned     BOOLEAN   NOT NULL DEFAULT FALSE
 *   archived_at   TIMESTAMP NULL
 *
 * Plus one composite index for archive filtering in ListChannelsAction:
 *
 *   idx_chmem_user_archived (user_id, archived_at)
 *
 * These back the per-member chat preferences added in Commit 6.6 and
 * the real unread tracking added in 6.5.
 *
 * Why a hand-rolled script and not Doctrine schema-tool:update:
 *   - schema-tool:update emits DROP statements for anything it can't
 *     match against current entity metadata. In a production DB with
 *     tables we created outside Doctrine's awareness (legacy imports,
 *     manual columns, etc.) that's unsafe.
 *   - This script ONLY adds. Never drops. Never changes existing columns.
 *   - Idempotent: checks pg_attribute before each ADD COLUMN, so
 *     re-running after partial success picks up where it left off.
 *
 * Usage:
 *   php bin/migrate-channel-member-prefs.php                # preview
 *   php bin/migrate-channel-member-prefs.php --apply        # with prompt
 *   php bin/migrate-channel-member-prefs.php --apply --yes  # no prompt
 *
 * Safe to run multiple times. After all columns exist, it's a no-op.
 */

require __DIR__ . '/../vendor/autoload.php';

if (file_exists(__DIR__ . '/../.env')) {
    $dotenv = \Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
    $dotenv->load();
}
$_ENV['APP_ENV'] = $_ENV['APP_ENV'] ?? 'production';

$args  = $argv ?? [];
$apply = in_array('--apply', $args, true);
$yes   = in_array('--yes', $args, true);

echo "============================================================\n";
echo " CreditX channel_members prefs migration\n";
echo "============================================================\n";
echo " Mode: " . ($apply ? 'APPLY (will mutate DB)' : 'DRY-RUN (read-only)') . "\n\n";

try {
    $em   = \App\Infrastructure\Persistence\DoctrineEntityManagerFactory::create();
    $conn = $em->getConnection();
} catch (\Throwable $e) {
    fwrite(STDERR, "✘ DB connection failed:\n  " . $e->getMessage() . "\n");
    exit(1);
}

/**
 * Return true if the given column already exists on the given table.
 * Uses information_schema — portable across PG + MySQL.
 */
function columnExists(\Doctrine\DBAL\Connection $conn, string $table, string $column): bool
{
    $sql = "SELECT 1 FROM information_schema.columns
             WHERE table_name = :t AND column_name = :c LIMIT 1";
    return (bool) $conn->fetchOne($sql, ['t' => $table, 'c' => $column]);
}

function indexExists(\Doctrine\DBAL\Connection $conn, string $indexName): bool
{
    // PostgreSQL-specific check — this project targets PG 16.
    $sql = "SELECT 1 FROM pg_indexes WHERE indexname = :n LIMIT 1";
    return (bool) $conn->fetchOne($sql, ['n' => $indexName]);
}

$table = 'channel_members';

$ops = [];

if (!columnExists($conn, $table, 'last_read_at')) {
    $ops[] = [
        'label' => 'Add column last_read_at (TIMESTAMP NULL)',
        'sql'   => "ALTER TABLE {$table} ADD COLUMN last_read_at TIMESTAMP(0) NULL",
    ];
} else {
    echo "  ✓ column last_read_at already exists\n";
}

if (!columnExists($conn, $table, 'is_muted')) {
    $ops[] = [
        'label' => 'Add column is_muted (BOOLEAN NOT NULL DEFAULT FALSE)',
        'sql'   => "ALTER TABLE {$table} ADD COLUMN is_muted BOOLEAN NOT NULL DEFAULT FALSE",
    ];
} else {
    echo "  ✓ column is_muted already exists\n";
}

if (!columnExists($conn, $table, 'is_pinned')) {
    $ops[] = [
        'label' => 'Add column is_pinned (BOOLEAN NOT NULL DEFAULT FALSE)',
        'sql'   => "ALTER TABLE {$table} ADD COLUMN is_pinned BOOLEAN NOT NULL DEFAULT FALSE",
    ];
} else {
    echo "  ✓ column is_pinned already exists\n";
}

if (!columnExists($conn, $table, 'archived_at')) {
    $ops[] = [
        'label' => 'Add column archived_at (TIMESTAMP NULL)',
        'sql'   => "ALTER TABLE {$table} ADD COLUMN archived_at TIMESTAMP(0) NULL",
    ];
} else {
    echo "  ✓ column archived_at already exists\n";
}

if (!indexExists($conn, 'idx_chmem_user_archived')) {
    $ops[] = [
        'label' => 'Add composite index (user_id, archived_at)',
        'sql'   => "CREATE INDEX idx_chmem_user_archived ON {$table} (user_id, archived_at)",
    ];
} else {
    echo "  ✓ index idx_chmem_user_archived already exists\n";
}

if (empty($ops)) {
    echo "\n✓ Nothing to do. All columns + index are already in place.\n";
    exit(0);
}

echo "\nPlanned changes (" . count($ops) . "):\n";
foreach ($ops as $i => $op) {
    echo sprintf("  %d. %s\n", $i + 1, $op['label']);
    echo sprintf("     SQL: %s\n", $op['sql']);
}
echo "\n";

if (!$apply) {
    echo "Dry-run only. Re-run with --apply to execute.\n";
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
    foreach ($ops as $op) {
        echo "  → " . $op['label'] . " ... ";
        $conn->executeStatement($op['sql']);
        echo "OK\n";
    }
    $conn->commit();
    echo "\n✓ All changes applied and committed.\n";
    echo "\nNext: clear Doctrine metadata cache and reload php-fpm so the\n";
    echo "entity layer picks up the new columns:\n";
    echo "    rm -rf var/cache/doctrine\n";
    echo "    sudo systemctl reload php-fpm\n";
    exit(0);
} catch (\Throwable $e) {
    $conn->rollBack();
    fwrite(STDERR, "✘ Migration failed, rolled back:\n  " . $e->getMessage() . "\n");
    exit(1);
}
