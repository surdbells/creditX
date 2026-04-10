<?php
declare(strict_types=1);
namespace App\Domain\Entity;

use App\Domain\Enum\BulkUploadStatus;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

#[ORM\Entity(repositoryClass: \App\Domain\Repository\BulkUploadRepository::class)]
#[ORM\Table(name: 'bulk_uploads')]
#[ORM\HasLifecycleCallbacks]
class BulkUpload
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\Column(type: 'string', length: 500, nullable: true)]
    private ?string $filePath = null;

    #[ORM\Column(type: 'string', length: 200, nullable: true)]
    private ?string $fileName = null;

    #[ORM\Column(type: 'integer', options: ['default' => 0])]
    private int $totalRecords = 0;

    #[ORM\Column(type: 'integer', options: ['default' => 0])]
    private int $processedRecords = 0;

    #[ORM\Column(type: 'integer', options: ['default' => 0])]
    private int $failedRecords = 0;

    #[ORM\Column(type: 'decimal', precision: 15, scale: 2, options: ['default' => '0.00'])]
    private string $totalAmount = '0.00';

    #[ORM\Column(type: 'string', length: 20, enumType: BulkUploadStatus::class)]
    private BulkUploadStatus $status = BulkUploadStatus::PENDING;

    #[ORM\Column(type: 'string', length: 36, nullable: true)]
    private ?string $uploadedBy = null;

    #[ORM\Column(type: 'string', length: 50)]
    private string $callbackReference;

    /** @var Collection<int, BulkUploadItem> */
    #[ORM\OneToMany(targetEntity: BulkUploadItem::class, mappedBy: 'bulkUpload', cascade: ['persist', 'remove'])]
    private Collection $items;

    public function __construct()
    {
        $this->id = Uuid::uuid4()->toString();
        $this->callbackReference = 'BULK-' . date('Ymd') . '-' . strtoupper(bin2hex(random_bytes(4)));
        $this->items = new ArrayCollection();
    }

    public function getId(): string { return $this->id; }
    public function getFilePath(): ?string { return $this->filePath; }
    public function setFilePath(?string $v): void { $this->filePath = $v; }
    public function getFileName(): ?string { return $this->fileName; }
    public function setFileName(?string $v): void { $this->fileName = $v; }
    public function getTotalRecords(): int { return $this->totalRecords; }
    public function setTotalRecords(int $v): void { $this->totalRecords = $v; }
    public function getProcessedRecords(): int { return $this->processedRecords; }
    public function setProcessedRecords(int $v): void { $this->processedRecords = $v; }
    public function incrementProcessed(): void { $this->processedRecords++; }
    public function getFailedRecords(): int { return $this->failedRecords; }
    public function setFailedRecords(int $v): void { $this->failedRecords = $v; }
    public function incrementFailed(): void { $this->failedRecords++; }
    public function getTotalAmount(): string { return $this->totalAmount; }
    public function setTotalAmount(string $v): void { $this->totalAmount = $v; }
    public function addToTotal(string $amount): void { $this->totalAmount = bcadd($this->totalAmount, $amount, 2); }
    public function getStatus(): BulkUploadStatus { return $this->status; }
    public function setStatus(BulkUploadStatus $v): void { $this->status = $v; }
    public function getUploadedBy(): ?string { return $this->uploadedBy; }
    public function setUploadedBy(?string $v): void { $this->uploadedBy = $v; }
    public function getCallbackReference(): string { return $this->callbackReference; }
    /** @return Collection<int, BulkUploadItem> */
    public function getItems(): Collection { return $this->items; }
    public function addItem(BulkUploadItem $item): void { $item->setBulkUpload($this); $this->items->add($item); }

    public function toArray(): array
    {
        return [
            'id' => $this->id, 'file_name' => $this->fileName,
            'total_records' => $this->totalRecords, 'processed_records' => $this->processedRecords,
            'failed_records' => $this->failedRecords, 'total_amount' => $this->totalAmount,
            'status' => $this->status->value, 'uploaded_by' => $this->uploadedBy,
            'callback_reference' => $this->callbackReference,
            'created_at' => $this->createdAt->format('Y-m-d H:i:s'),
        ];
    }
}
