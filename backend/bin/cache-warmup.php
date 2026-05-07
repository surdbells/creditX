<?php

declare(strict_types=1);

/**
 * CreditX — Doctrine Cache Warmup
 *
 * Clears stale Doctrine metadata cache + proxy classes, then
 * regenerates them from the current entity attributes. Run after
 * any deployment that adds, removes, or modifies an @Entity class.
 *
 * Why the clear-then-regenerate dance:
 *
 * The production EM uses FilesystemAdapter for metadata cache and
 * pre-generated proxy classes (autoGenerateProxyClasses=false).
 * Both sit on disk and persist across deployments.
 *
 * Doctrine's metadata cache, by default, has no TTL — once a class
 * is cached, it's cached until something explicitly invalidates it.
 * If you add a new field (e.g. Phase 2.5 added LedgerTransaction's
 * journal_entry_id ManyToOne) and don't clear the cache, the cached
 * metadata for that class is missing the new field. Doctrine then
 * builds INSERT statements that omit the new column, falling through
 * to the DB's column default — which for a NOT NULL column is a
 * 23502 error at INSERT time, with no clue about the actual cause.
 *
 * Calling getAllMetadata() rebuilds metadata from attributes and
 * writes back to cache. But if the cache file already exists with
 * an older serialized form, Doctrine reads from cache first and
 * skips the rebuild. Hence: clear the directory, THEN regenerate.
 *
 * Symptoms of a stale cache after entity changes:
 *   - 'null value in column "X" of relation "T" violates not-null
 *      constraint' where X is a new column
 *   - 'column "X" of relation "T" does not exist' if the cache has
 *      a column that was removed
 *   - Inserts succeeding but mysteriously skipping field updates
 *
 * After this script runs, Doctrine has fresh metadata + fresh proxy
 * classes. Reload PHP-FPM after to drop in-memory copies in long-
 * running workers.
 *
 * Idempotent. Safe to run any time.
 */

require __DIR__ . '/../vendor/autoload.php';

if (file_exists(__DIR__ . '/../.env')) {
    $dotenv = \Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
    $dotenv->load();
}

// Force production mode so we exercise the same caching path that
// PHP-FPM workers use. Otherwise the dev ArrayAdapter would no-op.
$_ENV['APP_ENV'] = 'production';

echo "=== CreditX Doctrine Cache Warmup ===\n\n";

$cacheDir = __DIR__ . '/../var/cache/doctrine';
$proxyDir = __DIR__ . '/../var/proxies';

// ─── Step 1: clear stale cache + proxies ───────────────────────────
echo "[1/3] Clearing stale cache + proxies...\n";

$deletedFiles = 0;
foreach ([$cacheDir, $proxyDir] as $dir) {
    if (! is_dir($dir)) {
        continue;
    }
    $rii = new \RecursiveIteratorIterator(
        new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS),
        \RecursiveIteratorIterator::CHILD_FIRST,
    );
    foreach ($rii as $file) {
        if ($file->isFile()) {
            @unlink($file->getPathname());
            $deletedFiles++;
        } elseif ($file->isDir()) {
            @rmdir($file->getPathname());
        }
    }
}
echo "  Removed {$deletedFiles} cache file(s)\n";

// ─── Step 2: rebuild metadata cache + proxy classes ────────────────
//
// Construct a fresh EM AFTER the cache is wiped — DoctrineEntityManagerFactory
// is a singleton, so if we'd built it before the wipe it would carry
// the stale in-memory metadata for this script's lifetime.
echo "[2/3] Rebuilding metadata + proxy classes...\n";

$em = \App\Infrastructure\Persistence\DoctrineEntityManagerFactory::create();
$metadata = $em->getMetadataFactory()->getAllMetadata();
echo "  Loaded " . count($metadata) . " entity metadata\n";

$em->getProxyFactory()->generateProxyClasses($metadata);
echo "  Proxy classes generated in var/proxies/\n";

// ─── Step 3: sanity-check ──────────────────────────────────────────
//
// Verify the metadata for LedgerTransaction includes journal_entry_id.
// This is a cheap canary — if Phase 2.5's FK is missing here, the
// regenerated cache is also missing it (something else is broken).
echo "[3/3] Sanity checking critical Phase-2.5 mappings...\n";

$ltMeta = $em->getClassMetadata(\App\Domain\Entity\LedgerTransaction::class);
$hasJournalFk = isset($ltMeta->associationMappings['journalEntry']);
echo "  LedgerTransaction.journalEntry mapping: "
    . ($hasJournalFk ? "✓ present" : "✗ MISSING — investigate") . "\n";

$jeMeta = $em->getClassMetadata(\App\Domain\Entity\JournalEntry::class);
echo "  JournalEntry entity metadata: ✓ loaded ({$jeMeta->getTableName()})\n";

echo "\nDone. Memory used: " . round(memory_get_peak_usage(true) / 1024 / 1024, 1) . " MB\n";
echo "Cache dir: var/cache/doctrine/\n";
echo "Proxy dir: var/proxies/\n";
echo "\nReload PHP-FPM next: sudo systemctl reload php-fpm-83\n";

