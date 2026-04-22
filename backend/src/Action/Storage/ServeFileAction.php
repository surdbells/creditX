<?php
declare(strict_types=1);
namespace App\Action\Storage;

use League\Flysystem\Filesystem;
use League\Flysystem\Local\LocalFilesystemAdapter;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class ServeFileAction
{
    /**
     * Map of file extensions to MIME types. Used as a fallback when
     * PHP's mime_content_type() is unavailable (fileinfo extension not
     * loaded) or returns an unusable application/octet-stream for
     * image files.
     *
     * Images in particular must NOT be sent as octet-stream — browsers
     * refuse to render them as <img> src and show a broken-image icon
     * even when the bytes are valid. This was the user-reported symptom
     * ('images show broken, PDFs work'): PDFs tolerate octet-stream
     * via Content-Disposition sniffing, images don't.
     */
    private const EXT_MIME_MAP = [
        'jpg'  => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'png'  => 'image/png',
        'gif'  => 'image/gif',
        'webp' => 'image/webp',
        'svg'  => 'image/svg+xml',
        'pdf'  => 'application/pdf',
        'doc'  => 'application/msword',
        'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xls'  => 'application/vnd.ms-excel',
        'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'txt'  => 'text/plain',
        'csv'  => 'text/csv',
    ];

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $path = $args['path'] ?? '';
        if (empty($path) || str_contains($path, '..')) {
            return $response->withStatus(404);
        }

        $configuredPath = $_ENV['STORAGE_PATH'] ?? '';
        $storagePath = ($configuredPath !== '' && str_starts_with($configuredPath, '/'))
            ? $configuredPath
            : dirname(__DIR__, 3) . '/storage';
        $fullPath = $storagePath . '/' . $path;

        if (!file_exists($fullPath)) {
            return $response->withStatus(404);
        }

        // Resolve MIME with a robust fallback chain:
        //   1. File extension lookup (deterministic, no ext required)
        //   2. mime_content_type() if the fileinfo extension is loaded
        //   3. application/octet-stream as last resort
        //
        // Extension-first because mime_content_type misclassifies some
        // files (e.g. webp as application/octet-stream on older PHP,
        // newly-written images as text/plain before filesystem syncs)
        // and the extension is deterministic for uploads we control.
        $ext = strtolower(pathinfo($fullPath, PATHINFO_EXTENSION));
        $mime = self::EXT_MIME_MAP[$ext] ?? null;
        if ($mime === null) {
            $mime = function_exists('mime_content_type')
                ? (mime_content_type($fullPath) ?: 'application/octet-stream')
                : 'application/octet-stream';
        }

        $stream = fopen($fullPath, 'rb');
        if ($stream === false) {
            return $response->withStatus(500);
        }

        $response = $response
            ->withHeader('Content-Type', $mime)
            ->withHeader('Content-Length', (string) filesize($fullPath))
            ->withHeader('Cache-Control', 'public, max-age=86400');

        $body = $response->getBody();
        while (!feof($stream)) {
            $body->write(fread($stream, 8192));
        }
        fclose($stream);

        return $response;
    }
}
