<?php

declare(strict_types=1);

namespace App\Infrastructure\Service;

use App\Domain\Entity\Customer;
use App\Domain\Entity\Document;
use App\Domain\Repository\DocumentRepository;
use Psr\Http\Message\UploadedFileInterface;

final class DocumentService
{
    private string $storagePath;

    private const ALLOWED_MIME_TYPES = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    public function __construct(
        private readonly DocumentRepository $docRepo,
        private readonly SettingsCacheService $settings,
    ) {
        $this->storagePath = $_ENV['STORAGE_PATH'] ?? 'storage/uploads';
    }

    /**
     * Resolve the max upload size in bytes.
     *
     * Priority:
     *   1. general.max_upload_size_mb system setting (admin-configurable)
     *   2. STORAGE_MAX_SIZE env var (legacy fallback for envs that pre-date
     *      the settings-driven value)
     *   3. 10MB hardcoded fallback
     *
     * Settings checked at call time rather than cached on construct so
     * an admin's change to general.max_upload_size_mb takes effect on the
     * next upload without needing a service restart.
     */
    private function maxFileSize(): int
    {
        $mb = $this->settings->getInt('general.max_upload_size_mb', 0);
        if ($mb > 0) {
            return $mb * 1024 * 1024;
        }
        return (int) ($_ENV['STORAGE_MAX_SIZE'] ?? 10485760);
    }

    /**
     * Upload and store a document.
     *
     * @throws \RuntimeException on validation failure
     */
    /**
     * @param string $type Document type code (DocumentTypeConfig.code). Callers
     *                     validate it against the document_types table.
     */
    public function upload(
        UploadedFileInterface $file,
        Customer $customer,
        string $type,
        ?string $loanId,
        ?string $uploadedBy,
    ): Document {
        // Validate file
        if ($file->getError() !== UPLOAD_ERR_OK) {
            throw new \RuntimeException('File upload failed with error code: ' . $file->getError());
        }

        $maxFileSize = $this->maxFileSize();
        $fileSize = $file->getSize();
        if ($fileSize === null || $fileSize > $maxFileSize) {
            $maxMb = round($maxFileSize / 1048576, 1);
            throw new \RuntimeException("File size exceeds maximum of {$maxMb}MB");
        }

        $mimeType = $file->getClientMediaType() ?? 'application/octet-stream';
        if (!in_array($mimeType, self::ALLOWED_MIME_TYPES, true)) {
            throw new \RuntimeException('File type not allowed: ' . $mimeType);
        }

        $originalName = $file->getClientFilename() ?? 'unknown';
        $extension = pathinfo($originalName, PATHINFO_EXTENSION);
        $safeName = bin2hex(random_bytes(16)) . '.' . strtolower($extension);

        // Organize by documents/customer/year/month — the 'documents/'
        // prefix segregates loan document uploads from other storage
        // subdirectories (avatars, uploads, exports, firebase). Prior
        // to this fix, loan docs landed directly under /storage/<uuid>
        // mixed with other content at the storage root, making backups
        // and manual inspection harder.
        //
        // The existing migration script
        // (backend/bin/migrate-documents-path.php) moves legacy files
        // and updates DB file_path columns for docs that were written
        // before this change.
        $subDir = 'documents/' . $customer->getId() . '/' . date('Y') . '/' . date('m');
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
