<?php
declare(strict_types=1);
namespace App\Action\Branding;

use App\Infrastructure\Service\{ApiResponse, BrandingService, SettingsCacheService};
use League\Flysystem\Filesystem;
use League\Flysystem\Local\LocalFilesystemAdapter;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};
use Psr\Log\LoggerInterface;
use Ramsey\Uuid\Uuid;

/**
 * POST /api/branding/logo — upload the org logo (multipart field: logo).
 *
 * Stores the file under storage/brand-assets/{uuid}.{ext} and saves the
 * public URL + path into the brand.logo_url / brand.logo_path settings. The
 * previous logo file is deleted after the settings commit (best-effort).
 */
final class UploadBrandLogoAction
{
    use ApiResponse;

    public function __construct(
        private readonly BrandingService $branding,
        private readonly SettingsCacheService $settings,
        private readonly ?LoggerInterface $logger = null,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $file = $request->getUploadedFiles()['logo'] ?? null;
        if (!$file || $file->getError() !== UPLOAD_ERR_OK) {
            return $this->validationError(['logo' => 'No valid file uploaded']);
        }

        $mime = $file->getClientMediaType();
        $ext = match ($mime) {
            'image/png'     => 'png',
            'image/jpeg'    => 'jpg',
            'image/webp'    => 'webp',
            'image/svg+xml' => 'svg',
            default         => null,
        };
        if ($ext === null) {
            return $this->validationError(['logo' => 'Only PNG, JPEG, WebP or SVG allowed']);
        }

        $maxMb = max(1, $this->settings->getInt('general.max_upload_size_mb', 10));
        if ($file->getSize() > $maxMb * 1024 * 1024) {
            return $this->validationError(['logo' => "Max file size is {$maxMb}MB"]);
        }

        $newPath = 'brand-assets/' . Uuid::uuid4()->toString() . '.' . $ext;

        $configuredPath = $_ENV['STORAGE_PATH'] ?? '';
        $storagePath = ($configuredPath !== '' && str_starts_with($configuredPath, '/'))
            ? $configuredPath
            : dirname(__DIR__, 3) . '/storage';
        $fs = new Filesystem(new LocalFilesystemAdapter($storagePath));

        $oldPath = (string) $this->settings->get('brand.logo_path', '');

        $stream = $file->getStream()->detach();
        try {
            $fs->writeStream($newPath, $stream);
        } catch (\Throwable $e) {
            $this->logger?->error('Brand logo upload failed', ['error' => $e->getMessage()]);
            return $this->error('Could not save the logo. Please try again.', 500);
        } finally {
            if (is_resource($stream)) fclose($stream);
        }

        $baseUrl = rtrim((string) ($_ENV['APP_URL'] ?? ''), '/');
        $logoUrl = $baseUrl . '/api/storage/' . $newPath;

        $this->branding->set([
            'brand.logo_path' => $newPath,
            'brand.logo_url'  => $logoUrl,
        ]);

        // Best-effort cleanup of the previous logo (settings already committed).
        if ($oldPath !== '' && $oldPath !== $newPath) {
            try { if ($fs->fileExists($oldPath)) $fs->delete($oldPath); }
            catch (\Throwable $e) { $this->logger?->warning('Old logo cleanup failed', ['path' => $oldPath, 'error' => $e->getMessage()]); }
        }

        return $this->success(['logo_url' => $logoUrl, 'logo_path' => $newPath], 'Logo updated');
    }
}
