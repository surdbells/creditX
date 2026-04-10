<?php

declare(strict_types=1);

namespace App\Domain\Entity;

use App\Domain\Enum\DocumentStatus;
use App\Domain\Enum\DocumentType;
use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

#[ORM\Entity(repositoryClass: \App\Domain\Repository\DocumentRepository::class)]
#[ORM\Table(name: 'documents')]
#[ORM\Index(name: 'idx_documents_customer', columns: ['customer_id'])]
#[ORM\Index(name: 'idx_documents_loan', columns: ['loan_id'])]
#[ORM\HasLifecycleCallbacks]
class Document
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\ManyToOne(targetEntity: Customer::class, inversedBy: 'documents')]
    #[ORM\JoinColumn(name: 'customer_id', referencedColumnName: 'id', nullable: false)]
    private Customer $customer;

    #[ORM\Column(type: 'string', length: 36, nullable: true)]
    private ?string $loanId = null;

    #[ORM\Column(type: 'string', length: 30, enumType: DocumentType::class)]
    private DocumentType $type;

    #[ORM\Column(type: 'string', length: 500)]
    private string $filePath;

    #[ORM\Column(type: 'string', length: 255)]
    private string $fileName;

    #[ORM\Column(type: 'integer')]
    private int $fileSize;

    #[ORM\Column(type: 'string', length: 100)]
    private string $mimeType;

    #[ORM\Column(type: 'string', length: 36, nullable: true)]
    private ?string $uploadedBy = null;

    #[ORM\Column(type: 'string', length: 20, enumType: DocumentStatus::class)]
    private DocumentStatus $status;

    #[ORM\Column(type: 'string', length: 36, nullable: true)]
    private ?string $verifiedBy = null;

    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $verifiedAt = null;

    #[ORM\Column(type: 'string', length: 500, nullable: true)]
    private ?string $rejectionReason = null;

    public function __construct()
    {
        $this->id = Uuid::uuid4()->toString();
        $this->status = DocumentStatus::PENDING;
    }

    // ─── Getters ───

    public function getId(): string { return $this->id; }
    public function getCustomer(): Customer { return $this->customer; }
    public function getLoanId(): ?string { return $this->loanId; }
    public function getType(): DocumentType { return $this->type; }
    public function getFilePath(): string { return $this->filePath; }
    public function getFileName(): string { return $this->fileName; }
    public function getFileSize(): int { return $this->fileSize; }
    public function getMimeType(): string { return $this->mimeType; }
    public function getUploadedBy(): ?string { return $this->uploadedBy; }
    public function getStatus(): DocumentStatus { return $this->status; }
    public function getVerifiedBy(): ?string { return $this->verifiedBy; }
    public function getVerifiedAt(): ?\DateTimeImmutable { return $this->verifiedAt; }
    public function getRejectionReason(): ?string { return $this->rejectionReason; }

    // ─── Setters ───

    public function setCustomer(Customer $v): void { $this->customer = $v; }
    public function setLoanId(?string $v): void { $this->loanId = $v; }
    public function setType(DocumentType $v): void { $this->type = $v; }
    public function setFilePath(string $v): void { $this->filePath = $v; }
    public function setFileName(string $v): void { $this->fileName = $v; }
    public function setFileSize(int $v): void { $this->fileSize = $v; }
    public function setMimeType(string $v): void { $this->mimeType = $v; }
    public function setUploadedBy(?string $v): void { $this->uploadedBy = $v; }

    public function verify(string $verifiedBy): void
    {
        $this->status = DocumentStatus::VERIFIED;
        $this->verifiedBy = $verifiedBy;
        $this->verifiedAt = new \DateTimeImmutable('now', new \DateTimeZone($_ENV['APP_TIMEZONE'] ?? 'Africa/Lagos'));
        $this->rejectionReason = null;
    }

    public function reject(string $rejectedBy, string $reason): void
    {
        $this->status = DocumentStatus::REJECTED;
        $this->verifiedBy = $rejectedBy;
        $this->verifiedAt = new \DateTimeImmutable('now', new \DateTimeZone($_ENV['APP_TIMEZONE'] ?? 'Africa/Lagos'));
        $this->rejectionReason = $reason;
    }

    public function toArray(): array
    {
        return [
            'id'               => $this->id,
            'customer_id'      => $this->customer->getId(),
            'loan_id'          => $this->loanId,
            'type'             => $this->type->value,
            'file_path'        => $this->filePath,
            'file_name'        => $this->fileName,
            'file_size'        => $this->fileSize,
            'mime_type'        => $this->mimeType,
            'uploaded_by'      => $this->uploadedBy,
            'status'           => $this->status->value,
            'verified_by'      => $this->verifiedBy,
            'verified_at'      => $this->verifiedAt?->format('Y-m-d H:i:s'),
            'rejection_reason' => $this->rejectionReason,
            'created_at'       => $this->createdAt->format('Y-m-d H:i:s'),
        ];
    }
}
