<?php
declare(strict_types=1);
namespace App\Domain\Entity;

use App\Domain\Enum\BulkUploadItemStatus;
use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

#[ORM\Entity]
#[ORM\Table(name: 'bulk_upload_items')]
#[ORM\HasLifecycleCallbacks]
class BulkUploadItem
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\ManyToOne(targetEntity: BulkUpload::class, inversedBy: 'items')]
    #[ORM\JoinColumn(name: 'bulk_upload_id', referencedColumnName: 'id', nullable: false)]
    private BulkUpload $bulkUpload;

    #[ORM\Column(type: 'string', length: 50)]
    private string $staffId;

    #[ORM\Column(type: 'string', length: 200, nullable: true)]
    private ?string $customerName = null;

    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)]
    private string $amount;

    #[ORM\Column(type: 'string', length: 36, nullable: true)]
    private ?string $ledgerId = null;

    #[ORM\Column(type: 'string', length: 20, enumType: BulkUploadItemStatus::class)]
    private BulkUploadItemStatus $status = BulkUploadItemStatus::PENDING;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $errorMessage = null;

    public function __construct() { $this->id = Uuid::uuid4()->toString(); }

    public function getId(): string { return $this->id; }
    public function getBulkUpload(): BulkUpload { return $this->bulkUpload; }
    public function setBulkUpload(BulkUpload $v): void { $this->bulkUpload = $v; }
    public function getStaffId(): string { return $this->staffId; }
    public function setStaffId(string $v): void { $this->staffId = trim($v); }
    public function getCustomerName(): ?string { return $this->customerName; }
    public function setCustomerName(?string $v): void { $this->customerName = $v; }
    public function getAmount(): string { return $this->amount; }
    public function setAmount(string $v): void { $this->amount = $v; }
    public function getLedgerId(): ?string { return $this->ledgerId; }
    public function setLedgerId(?string $v): void { $this->ledgerId = $v; }
    public function getStatus(): BulkUploadItemStatus { return $this->status; }
    public function setStatus(BulkUploadItemStatus $v): void { $this->status = $v; }
    public function getErrorMessage(): ?string { return $this->errorMessage; }
    public function setErrorMessage(?string $v): void { $this->errorMessage = $v; }

    public function toArray(): array
    {
        return [
            'id' => $this->id, 'staff_id' => $this->staffId, 'customer_name' => $this->customerName,
            'amount' => $this->amount, 'ledger_id' => $this->ledgerId,
            'status' => $this->status->value, 'error_message' => $this->errorMessage,
        ];
    }
}
