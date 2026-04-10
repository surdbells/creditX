<?php

declare(strict_types=1);

namespace App\Infrastructure\Service;

use App\Domain\Entity\Customer;
use App\Domain\Entity\Document;
use App\Domain\Enum\DocumentType;
use App\Domain\Repository\DocumentRepository;
use Psr\Http\Message\UploadedFileInterface;

final class DocumentService
{
    private string $storagePath;
    private int $maxFileSize;

    private const ALLOWED_MIME_TYPES = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    public function __construct(
        private readonly DocumentRepository $docRepo,
    ) {
        $this->storagePath = $_ENV['STORAGE_PATH'] ?? 'storage/uploads';
        $this->maxFileSize = (int) ($_ENV['STORAGE_MAX_SIZE'] ?? 10485760); // 10MB
    }

    /**
     * Upload and store a document.
     *
     * @throws \RuntimeException on validation failure
     */
    public function upload(
        UploadedFileInterface $file,
        Customer $customer,
        DocumentType $type,
        ?string $loanId,
        ?string $uploadedBy,
    ): Document {
        // Validate file
        if ($file->getError() !== UPLOAD_ERR_OK) {
            throw new \RuntimeException('File upload failed with error code: ' . $file->getError());
        }

        $fileSize = $file->getSize();
        if ($fileSize === null || $fileSize > $this->maxFileSize) {
            $maxMb = round($this->maxFileSize / 1048576, 1);
            throw new \RuntimeException("File size exceeds maximum of {$maxMb}MB");
        }

        $mimeType = $file->getClientMediaType() ?? 'application/octet-stream';
        if (!in_array($mimeType, self::ALLOWED_MIME_TYPES, true)) {
            throw new \RuntimeException('File type not allowed: ' . $mimeType);
        }

        $originalName = $file->getClientFilename() ?? 'unknown';
        $extension = pathinfo($originalName, PATHINFO_EXTENSION);
        $safeName = bin2hex(random_bytes(16)) . '.' . strtolower($extension);

        // Organize by customer/year/month
        $subDir = $customer->getId() . '/' . date('Y') . '/' . date('m');
        $fullDir = rtrim($this->storagePath, '/') . '/' . $subDir;

        if (!is_dir($fullDir)) {
            mkdir($fullDir, 0755, true);
        }

        $filePath = $subDir . '/' . $safeName;
        $fullPath = rtrim($this->storagePath, '/') . '/' . $filePath;

        $file->moveTo($fullPath);

        $doc = new Document();
        $doc->setCustomer($customer);
        $doc->setLoanId($loanId);
        $doc->setType($type);
        $doc->setFilePath($filePath);
        $doc->setFileName($originalName);
        $doc->setFileSize((int) $fileSize);
        $doc->setMimeType($mimeType);
        $doc->setUploadedBy($uploadedBy);

        $this->docRepo->save($doc);

        return $doc;
    }

    /**
     * Get the full filesystem path for a document.
     */
    public function getFullPath(Document $doc): string
    {
        return rtrim($this->storagePath, '/') . '/' . $doc->getFilePath();
    }

    /**
     * Delete a document and its file.
     */
    public function delete(Document $doc): void
    {
        $fullPath = $this->getFullPath($doc);
        if (file_exists($fullPath)) {
            unlink($fullPath);
        }
        $this->docRepo->remove($doc);
        $this->docRepo->flush();
    }
}
