<?php
declare(strict_types=1);
namespace App\Action\Storage;

use League\Flysystem\Filesystem;
use League\Flysystem\Local\LocalFilesystemAdapter;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class ServeFileAction
{
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

        $mime = mime_content_type($fullPath) ?: 'application/octet-stream';
        $stream = fopen($fullPath, 'rb');

        $response = $response
            ->withHeader('Content-Type', $mime)
            ->withHeader('Cache-Control', 'public, max-age=86400');

        $body = $response->getBody();
        while (!feof($stream)) {
            $body->write(fread($stream, 8192));
        }
        fclose($stream);

        return $response;
    }
}
