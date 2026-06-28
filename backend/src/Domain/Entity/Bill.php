<?php
declare(strict_types=1);
namespace App\Domain\Entity;

use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

/**
 * Bill — a vendor invoice in the accounts-payable ledger.
 *
 * Lifecycle:
 *   draft     — captured, not yet in the GL
 *   approved  — expense accrued: DR <expense GL> / CR Accruals & Payables
 *   partially_paid / paid — payments DR Accruals & Payables / CR Bank
 *   void      — cancelled before approval (no GL impact) or reversed
 */
#[ORM\Entity]
#[ORM\Table(name: 'bills')]
#[ORM\Index(name: 'idx_bill_status', columns: ['status'])]
#[ORM\Index(name: 'idx_bill_due', columns: ['due_date'])]
#[ORM\HasLifecycleCallbacks]
class Bill
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\ManyToOne(targetEntity: Vendor::class)]
    #[ORM\JoinColumn(name: 'vendor_id', referencedColumnName: 'id', nullable: false)]
    private Vendor $vendor;

    #[ORM\Column(name: 'bill_number', type: 'string', length: 60)]
    private string $billNumber;

    #[ORM\Column(name: 'bill_date', type: 'date')]
    private \DateTimeInterface $billDate;

    #[ORM\Column(name: 'due_date', type: 'date')]
    private \DateTimeInterface $dueDate;

    #[ORM\Column(type: 'string', length: 300, nullable: true)]
    private ?string $description = null;

    /** GL code of the expense account debited on approval. */
    #[ORM\Column(name: 'expense_gl_code', type: 'string', length: 20)]
    private string $expenseGlCode = 'GENADMIN';

    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)]
    private string $amount = '0.00';

    #[ORM\Column(name: 'amount_paid', type: 'decimal', precision: 15, scale: 2)]
    private string $amountPaid = '0.00';

    /** 'draft' | 'approved' | 'partially_paid' | 'paid' | 'void' */
    #[ORM\Column(type: 'string', length: 20)]
    private string $status = 'draft';

    #[ORM\Column(type: 'string', length: 36, nullable: true)]
    private ?string $createdBy = null;

    public function __construct() { $this->id = Uuid::uuid4()->toString(); }

    public function getId(): string { return $this->id; }
    public function getVendor(): Vendor { return $this->vendor; }
    public function setVendor(Vendor $v): void { $this->vendor = $v; }
    public function getBillNumber(): string { return $this->billNumber; }
    public function setBillNumber(string $v): void { $this->billNumber = $v; }
    public function getBillDate(): \DateTimeInterface { return $this->billDate; }
    public function setBillDate(\DateTimeInterface $v): void { $this->billDate = $v; }
    public function getDueDate(): \DateTimeInterface { return $this->dueDate; }
    public function setDueDate(\DateTimeInterface $v): void { $this->dueDate = $v; }
    public function getDescription(): ?string { return $this->description; }
    public function setDescription(?string $v): void { $this->description = $v; }
    public function getExpenseGlCode(): string { return $this->expenseGlCode; }
    public function setExpenseGlCode(string $v): void { $this->expenseGlCode = $v; }
    public function getAmount(): string { return $this->amount; }
    public function setAmount(string $v): void { $this->amount = $v; }
    public function getAmountPaid(): string { return $this->amountPaid; }
    public function setAmountPaid(string $v): void { $this->amountPaid = $v; }
    public function getStatus(): string { return $this->status; }
    public function setStatus(string $v): void { $this->status = $v; }
    public function getCreatedBy(): ?string { return $this->createdBy; }
    public function setCreatedBy(?string $v): void { $this->createdBy = $v; }

    public function outstanding(): string
    {
        return bcsub($this->amount, $this->amountPaid, 2);
    }

    public function toArray(): array
    {
        return [
            'id'              => $this->id,
            'vendor_id'       => $this->vendor->getId(),
            'vendor_name'     => $this->vendor->getName(),
            'bill_number'     => $this->billNumber,
            'bill_date'       => $this->billDate->format('Y-m-d'),
            'due_date'        => $this->dueDate->format('Y-m-d'),
            'description'     => $this->description,
            'expense_gl_code' => $this->expenseGlCode,
            'amount'          => $this->amount,
            'amount_paid'     => $this->amountPaid,
            'outstanding'     => $this->outstanding(),
            'status'          => $this->status,
            'created_at'      => $this->createdAt->format('Y-m-d H:i:s'),
        ];
    }
}
