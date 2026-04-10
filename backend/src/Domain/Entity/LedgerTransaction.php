<?php
declare(strict_types=1);
namespace App\Domain\Entity;

use App\Domain\Enum\TransactionType;
use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

#[ORM\Entity(repositoryClass: \App\Domain\Repository\LedgerTransactionRepository::class)]
#[ORM\Table(name: 'ledger_transactions')]
#[ORM\Index(name: 'idx_lt_gl', columns: ['gl_id'])]
#[ORM\Index(name: 'idx_lt_customer_ledger', columns: ['customer_ledger_id'])]
#[ORM\Index(name: 'idx_lt_callback', columns: ['trans_callback'])]
#[ORM\Index(name: 'idx_lt_year_month', columns: ['trans_year', 'trans_month'])]
#[ORM\HasLifecycleCallbacks]
class LedgerTransaction
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\ManyToOne(targetEntity: GeneralLedger::class)]
    #[ORM\JoinColumn(name: 'gl_id', referencedColumnName: 'id', nullable: false)]
    private GeneralLedger $generalLedger;

    #[ORM\ManyToOne(targetEntity: CustomerLedger::class)]
    #[ORM\JoinColumn(name: 'customer_ledger_id', referencedColumnName: 'id', nullable: true)]
    private ?CustomerLedger $customerLedger = null;

    #[ORM\Column(type: 'string', length: 5, enumType: TransactionType::class)]
    private TransactionType $transType;

    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)]
    private string $transAmount;

    #[ORM\Column(type: 'string', length: 500)]
    private string $transNarration;

    #[ORM\Column(type: 'string', length: 50, nullable: true)]
    private ?string $transReference = null;

    /** Batch grouping key for related entries */
    #[ORM\Column(type: 'string', length: 50, nullable: true)]
    private ?string $transCallback = null;

    #[ORM\Column(type: 'string', length: 4)]
    private string $transYear;

    #[ORM\Column(type: 'string', length: 2)]
    private string $transMonth;

    #[ORM\Column(type: 'string', length: 2)]
    private string $transDay;

    #[ORM\Column(type: 'boolean', options: ['default' => false])]
    private bool $isRepayment = false;

    #[ORM\Column(type: 'string', length: 36, nullable: true)]
    private ?string $postedBy = null;

    /** For reversals — links to original transaction */
    #[ORM\Column(type: 'string', length: 36, nullable: true)]
    private ?string $reversalOfId = null;

    public function __construct()
    {
        $this->id = Uuid::uuid4()->toString();
        $this->transYear = date('Y');
        $this->transMonth = date('m');
        $this->transDay = date('d');
    }

    public function getId(): string { return $this->id; }
    public function getGeneralLedger(): GeneralLedger { return $this->generalLedger; }
    public function setGeneralLedger(GeneralLedger $v): void { $this->generalLedger = $v; }
    public function getCustomerLedger(): ?CustomerLedger { return $this->customerLedger; }
    public function setCustomerLedger(?CustomerLedger $v): void { $this->customerLedger = $v; }
    public function getTransType(): TransactionType { return $this->transType; }
    public function setTransType(TransactionType $v): void { $this->transType = $v; }
    public function getTransAmount(): string { return $this->transAmount; }
    public function setTransAmount(string $v): void { $this->transAmount = $v; }
    public function getTransNarration(): string { return $this->transNarration; }
    public function setTransNarration(string $v): void { $this->transNarration = $v; }
    public function getTransReference(): ?string { return $this->transReference; }
    public function setTransReference(?string $v): void { $this->transReference = $v; }
    public function getTransCallback(): ?string { return $this->transCallback; }
    public function setTransCallback(?string $v): void { $this->transCallback = $v; }
    public function getTransYear(): string { return $this->transYear; }
    public function getTransMonth(): string { return $this->transMonth; }
    public function getTransDay(): string { return $this->transDay; }
    public function setTransDate(string $year, string $month, string $day): void
    {
        $this->transYear = $year;
        $this->transMonth = str_pad($month, 2, '0', STR_PAD_LEFT);
        $this->transDay = str_pad($day, 2, '0', STR_PAD_LEFT);
    }
    public function isRepayment(): bool { return $this->isRepayment; }
    public function setIsRepayment(bool $v): void { $this->isRepayment = $v; }
    public function getPostedBy(): ?string { return $this->postedBy; }
    public function setPostedBy(?string $v): void { $this->postedBy = $v; }
    public function getReversalOfId(): ?string { return $this->reversalOfId; }
    public function setReversalOfId(?string $v): void { $this->reversalOfId = $v; }

    public function toArray(): array
    {
        return [
            'id'                 => $this->id,
            'gl_id'              => $this->generalLedger->getId(),
            'gl_name'            => $this->generalLedger->getAccountName(),
            'gl_code'            => $this->generalLedger->getAccountCode(),
            'customer_ledger_id' => $this->customerLedger?->getId(),
            'customer_ledger_no' => $this->customerLedger?->getAccountNumber(),
            'trans_type'         => $this->transType->value,
            'trans_amount'       => $this->transAmount,
            'trans_narration'    => $this->transNarration,
            'trans_reference'    => $this->transReference,
            'trans_callback'     => $this->transCallback,
            'trans_date'         => "{$this->transYear}-{$this->transMonth}-{$this->transDay}",
            'is_repayment'       => $this->isRepayment,
            'posted_by'          => $this->postedBy,
            'reversal_of_id'     => $this->reversalOfId,
            'created_at'         => $this->createdAt->format('Y-m-d H:i:s'),
        ];
    }
}
