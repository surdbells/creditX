<?php
declare(strict_types=1);
namespace App\Action\User;

use App\Domain\Entity\User;
use App\Infrastructure\Service\ApiResponse;
use App\Infrastructure\Service\SettingsCacheService;
use Doctrine\ORM\EntityManagerInterface;
use League\Flysystem\Filesystem;
use League\Flysystem\Local\LocalFilesystemAdapter;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};
use Psr\Log\LoggerInterface;
use Ramsey\Uuid\Uuid;

/**
 * POST /api/users/{id}/avatar
 *
 * Replaces the user's avatar image. Lifecycle:
 *
 *   1. Validate upload (type, size)
 *   2. Write NEW file to disk under a fresh UUID filename
 *   3. Update User entity to point at the new filename
 *   4. Flush DB
 *   5. Delete OLD file from disk (only if step 4 succeeded)
 *
 * If the flush throws, the new file on disk is cleaned up so we don't
 * leave orphans. The old file is only deleted after the DB commit so
 * a mid-process failure can't leave the user with no avatar and the
 * DB pointing at a deleted file.
 *
 * Defensive ordering rationale:
 *
 *   OLD ORDER (broken):
 *     delete old file -> write new file -> set entity -> flush
 *   If flush failed, DB still pointed at the deleted old file AND a
 *   new orphan existed. User's avatar column went stale; list queries
 *   returned a 404'ing avatar_url. That's how today's production got
 *   into the state where DB said one filename but disk had another.
 *
 *   NEW ORDER:
 *     write new file -> set entity -> flush -> delete old file
 *   If flush fails, cleanup the new file (no orphans, no DB change).
 *   If delete-old fails, the DB is still correct; we just have a
 *   stale file, which a periodic cleanup job can handle. Never leaves
 *   the DB in a state pointing to a non-existent file.
 */
final class UploadAvatarAction
{
    use ApiResponse;

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly SettingsCacheService $settings,
        private readonly ?LoggerInterface $logger = null,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $user = $this->em->find(User::class, $args['id'] ?? '');
        if (!$user) return $this->notFound('User not found');

        $files = $request->getUploadedFiles();
        $file = $files['avatar'] ?? null;
        if (!$file || $file->getError() !== UPLOAD_ERR_OK) {
            return $this->validationError(['avatar' => 'No valid file uploaded']);
        }

        // Validate file type
        $mime = $file->getClientMediaType();
        if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], true)) {
            return $this->validationError(['avatar' => 'Only JPEG, PNG, WebP, GIF allowed']);
        }

        // Validate size — admin-configured via general.max_upload_size_mb in
        // system settings. Defaults to 10MB if the setting is absent.
        $maxMb = max(1, $this->settings->getInt('general.max_upload_size_mb', 10));
        $maxBytes = $maxMb * 1024 * 1024;
        if ($file->getSize() > $maxBytes) {
            return $this->validationError(['avatar' => "Max file size is {$maxMb}MB"]);
        }

        $ext = match ($mime) {
            'image/jpeg' => 'jpg',
            'image/png'  => 'png',
            'image/webp' => 'webp',
            'image/gif'  => 'gif',
            default      => 'jpg',
        };

        $newFilename = 'avatars/' . Uuid::uuid4()->toString() . '.' . $ext;

        // Flysystem adapter rooted at the storage path
        $configuredPath = $_ENV['STORAGE_PATH'] ?? '';
        $storagePath = ($configuredPath !== '' && str_starts_with($configuredPath, '/'))
            ? $configuredPath
            : dirname(__DIR__, 3) . '/storage';
        $fs = new Filesystem(new LocalFilesystemAdapter($storagePath));

        $oldPath = $user->getAvatarPath();

        // ─── Step 1: write NEW file ──────────────────────────────────────
        $stream = $file->getStream()->detach();
        try {
            $fs->writeStream($newFilename, $stream);
        } catch (\Throwable $e) {
            // New file failed to write. Nothing has changed in DB or on disk
            // beyond whatever writeStream leaked (Flysystem cleans up
            // partial writes internally). Safe to return.
            $this->logger?->error('Avatar upload: writeStream failed', [
                'user_id' => $user->getId(),
                'error' => $e->getMessage(),
            ]);
            return $this->error('Could not save avatar. Please try again.', 500);
        } finally {
            if (is_resource($stream)) {
                fclose($stream);
            }
        }

        // ─── Step 2: update DB to point at new file ─────────────────────
        $user->setAvatarPath($newFilename);
        try {
            $this->em->flush();
        } catch (\Throwable $e) {
            // Flush failed. Clean up the new file we just wrote so we
            // don't leave an orphan taking up disk space. DB is still
            // pointing at the OLD file (unchanged by the entity mutation
            // since we never committed).
            try {
                if ($fs->fileExists($newFilename)) {
                    $fs->delete($newFilename);
                }
            } catch (\Throwable $cleanupErr) {
                $this->logger?->warning('Avatar upload: could not clean up after flush failure', [
                    'user_id' => $user->getId(),
                    'orphan_file' => $newFilename,
                    'cleanup_error' => $cleanupErr->getMessage(),
                ]);
            }
            $this->logger?->error('Avatar upload: DB flush failed', [
                'user_id' => $user->getId(),
                'error' => $e->getMessage(),
            ]);
            return $this->error('Could not save avatar. Please try again.', 500);
        }

        // ─── Step 3: delete OLD file (only after DB commit succeeded) ──
        // Best-effort: if this fails we log but don't roll back the upload.
        // Worst case is a stale file on disk; a periodic cleanup job can
        // reconcile storage against the DB. The user's avatar is correct.
        if ($oldPath !== null && $oldPath !== '' && $oldPath !== $newFilename) {
            try {
                if ($fs->fileExists($oldPath)) {
                    $fs->delete($oldPath);
                }
            } catch (\Throwable $e) {
                $this->logger?->warning('Avatar upload: could not delete old file', [
                    'user_id' => $user->getId(),
                    'old_path' => $oldPath,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        // Build absolute URL using /api/storage route alias (not legacy
        // /storage) so the URL works regardless of nginx static-file
        // config. Matches what User::toArray() emits on the list endpoint
        // so the admin sees consistent URLs from both the upload response
        // and subsequent list fetches.
        $baseUrl = rtrim((string) ($_ENV['APP_URL'] ?? ''), '/');

        return $this->success([
            'avatar_path' => $newFilename,
            'avatar_url'  => $baseUrl . '/api/storage/' . $newFilename,
        ], 'Avatar uploaded');
    }
}
