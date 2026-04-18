<?php
declare(strict_types=1);
namespace App\Action\User;

use App\Domain\Entity\User;
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use League\Flysystem\Filesystem;
use League\Flysystem\Local\LocalFilesystemAdapter;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};
use Ramsey\Uuid\Uuid;

final class UploadAvatarAction
{
    use ApiResponse;
    public function __construct(private readonly EntityManagerInterface $em) {}

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
        if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp', 'image/gif'])) {
            return $this->validationError(['avatar' => 'Only JPEG, PNG, WebP, GIF allowed']);
        }

        // Validate size (max 2MB)
        if ($file->getSize() > 2 * 1024 * 1024) {
            return $this->validationError(['avatar' => 'Max file size is 2MB']);
        }

        $ext = match($mime) {
            'image/jpeg' => 'jpg', 'image/png' => 'png',
            'image/webp' => 'webp', 'image/gif' => 'gif', default => 'jpg',
        };

        $filename = 'avatars/' . Uuid::uuid4()->toString() . '.' . $ext;

        // Use Flysystem local adapter
        $storagePath = $_ENV['STORAGE_PATH'] ?? dirname(__DIR__, 3) . '/storage';
        $adapter = new LocalFilesystemAdapter($storagePath);
        $fs = new Filesystem($adapter);

        // Delete old avatar if exists
        $oldPath = $user->getAvatarPath();
        if ($oldPath && $fs->fileExists($oldPath)) {
            $fs->delete($oldPath);
        }

        // Store new avatar
        $stream = $file->getStream()->detach();
        $fs->writeStream($filename, $stream);
        if (is_resource($stream)) fclose($stream);

        $user->setAvatarPath($filename);
        $this->em->flush();

        $baseUrl = rtrim($_ENV['APP_URL'] ?? '', '/');

        return $this->success([
            'avatar_path' => $filename,
            'avatar_url' => $baseUrl . '/storage/' . $filename,
        ], 'Avatar uploaded');
    }
}
