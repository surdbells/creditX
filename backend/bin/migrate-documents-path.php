<?php

declare(strict_types=1);

/**
 * CreditX — Migrate legacy document storage paths
 *
 * Before commit P, DocumentService::upload() stored files at:
 *   storage/<customer_uuid>/<year>/<month>/<hash>.ext
 *
 * After commit P, the format is:
 *   storage/documents/<customer_uuid>/<year>/<month>/<hash>.ext
 *
 * This was done to segregate loan documents from other storage
 * subdirectories (avatars, uploads, exports, firebase) — easier
 * backups, easier manual inspection, clearer ownership.
 *
 * This migration:
 *   1. Finds all Document rows where file_path does NOT start with
 *      'documents/' (i.e. written under the old format)
 *   2. Physically moves the file from old → new location on disk
 *   3. Updates the file_path column in the DB
 *
 * Idempotent: re-running is a no-op once all files are migrated.
 * Safe on partial runs: each document is migrated in its own
 * transaction, so a failure mid-way doesn't corrupt state.
 *
 * Usage:
 *   php bin/migrate-documents-path.php                # dry-run, shows plan
 *   php bin/migrate-documents-path.php --apply        # apply, prompts
 *   php bin/migrate-documents-path.php --apply --yes  # apply, no prompt
 */

require __DIR__ . '/../vendor/autoload.php';

if (file_exists(__DIR__ . '/../.env')) {
    $dotenv = \Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
    $dotenv->load();
}

echo "=== CreditX Document Path Migration ===\n\n";

$em = \App\Infrastructure\Persistence\DoctrineEntityManagerFactory::create();

$apply = in_array('--apply', $argv, true);
$yes = in_array('--yes', $argv, true);

$configuredPath = $_ENV['STORAGE_PATH'] ?? '';
$storagePath = ($configuredPath !== '' && str_starts_with($configuredPath, '/'))
    ? $configuredPath
    : dirname(__DIR__) . '/storage';

echo "Storage root: {$storagePath}\n\n";

// Find all documents with legacy paths
$repo = $em->getRepository(\App\Domain\Entity\Document::class);
$qb = $em->createQueryBuilder()
    ->select('d')
    ->from(\App\Domain\Entity\Document::class, 'd')
    ->where('d.filePath NOT LIKE :prefix')
    ->setParameter('prefix', 'documents/%');
$docs = $qb->getQuery()->getResult();

if (empty($docs)) {
    echo "✓ All documents already use the 'documents/' prefix. Nothing to do.\n";
    exit(0);
}

echo "Found " . count($docs) . " document(s) with legacy paths.\n\n";

// Classify each document by whether the source file exists on disk
$toMigrate = [];
$missing = [];
foreach ($docs as $doc) {
    $oldPath = $doc->getFilePath();
    $fullOld = $storagePath . '/' . $oldPath;
    if (file_exists($fullOld)) {
        $toMigrate[] = $doc;
    } else {
        $missing[] = ['doc' => $doc, 'expected_at' => $fullOld];
    }
}

echo "  Files present on disk and migratable: " . count($toMigrate) . "\n";
echo "  Files missing from disk (DB only):    " . count($missing) . "\n\n";

if (!empty($missing)) {
    echo "⚠  Missing files — these DB rows point to files that are not on disk:\n";
    foreach (array_slice($missing, 0, 10) as $row) {
        echo "   - Document " . $row['doc']->getId()
            . " expected at " . $row['expected_at'] . "\n";
    }
    if (count($missing) > 10) {
        echo "   ... and " . (count($missing) - 10) . " more\n";
    }
    echo "\n   The migration will still update their file_path columns\n"
       . "   (prepend 'documents/') so they follow the new convention,\n"
       . "   but the files themselves will remain missing. Restore them\n"
       . "   from backup separately if needed.\n\n";
}

// Preview a handful of planned moves
echo "Sample migrations (showing first 5 of " . count($docs) . "):\n";
foreach (array_slice($docs, 0, 5) as $doc) {
    $oldPath = $doc->getFilePath();
    $newPath = 'documents/' . $oldPath;
    echo "  {$oldPath}\n    → {$newPath}\n";
}
if (count($docs) > 5) {
    echo "  ... and " . (count($docs) - 5) . " more\n";
}

if (!$apply) {
    echo "\nDry-run only. To apply:\n"
       . "  php bin/migrate-documents-path.php --apply\n";
    exit(0);
}

if (!$yes) {
    echo "\nProceed? [y/N]: ";
    $line = trim((string) fgets(STDIN));
    if (strtolower($line) !== 'y' && strtolower($line) !== 'yes') {
        echo "Aborted.\n";
        exit(2);
    }
}

// Ensure the documents/ root exists
$documentsRoot = $storagePath . '/documents';
if (!is_dir($documentsRoot)) {
    if (!mkdir($documentsRoot, 0755, true)) {
        fwrite(STDERR, "✘ Failed to create {$documentsRoot}\n");
        exit(1);
    }
    echo "  Created {$documentsRoot}\n";
}

echo "\nApplying migration...\n";

$migrated = 0;
$updatedDbOnly = 0;
$failed = 0;

foreach ($docs as $doc) {
    $oldPath = $doc->getFilePath();
    $newPath = 'documents/' . $oldPath;
    $fullOld = $storagePath . '/' . $oldPath;
    $fullNew = $storagePath . '/' . $newPath;

    try {
        // Ensure parent directory exists at the new location
        $newDir = dirname($fullNew);
        if (!is_dir($newDir)) {
            mkdir($newDir, 0755, true);
        }

        $fileMovedOrSkipped = true;
        if (file_exists($fullOld)) {
            if (file_exists($fullNew)) {
                // Target already exists (unexpected but possible if a
                // previous partial run moved the file but didn't
                // commit the DB update). Skip the move, proceed to
                // update the DB so they align.
                echo "  ~ " . $doc->getId() . "  (new location already exists, updating DB only)\n";
            } else {
                if (!rename($fullOld, $fullNew)) {
                    throw new \RuntimeException("rename failed: {$fullOld} → {$fullNew}");
                }
            }
        } else {
            // File missing on disk; update DB only so it follows the
            // new convention if/when the file is restored.
            $updatedDbOnly++;
        }

        $em->beginTransaction();
        try {
            $doc->setFilePath($newPath);
            $em->flush();
            $em->commit();
            $migrated++;
            if ($migrated % 50 === 0) {
                echo "  Progress: {$migrated}/" . count($docs) . "\n";
            }
        } catch (\Throwable $e) {
            $em->rollback();
            // Try to roll back the disk rename too
            if (file_exists($fullNew) && !file_exists($fullOld)) {
                @rename($fullNew, $fullOld);
            }
            throw $e;
        }
    } catch (\Throwable $e) {
        fwrite(STDERR, "  ✘ Failed " . $doc->getId() . ": " . $e->getMessage() . "\n");
        $failed++;
    }
}

echo "\n✓ Done.\n";
echo "  Migrated: {$migrated}\n";
echo "  DB-only updates (file missing on disk): {$updatedDbOnly}\n";
echo "  Failed: {$failed}\n";

exit($failed > 0 ? 1 : 0);
