<?php
declare(strict_types=1);
namespace App\Domain\Entity;

use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

/**
 * TaxTransaction — a computed tax liability (or reclaim) raised against the
 * Tax Payable (TAXPAY) account.
 *
 * kind:
 *   'VAT_OUTPUT' / 'WHT' — tax owed to authorities (CR TAXPAY)
 *   'VAT_INPUT'          — recoverable input VAT (DR TAXPAY)
 *
 * status: 'pending' (accrued, not yet remitted) | 'remitted'.
 */
#[ORM\Entity]
#[ORM\Table(name: 'tax_transactions')]
#[ORM\Index(name: 'idx_tax_period', columns: ['period_year', 'period_month'])]
#[ORM\Index(name: 'idx_tax_status', columns: ['status'])]
#[ORM\HasLifecycleCallbacks]
class TaxTransaction
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    /** 'VAT_OUTPUT' | 'VAT_INPUT' | 'WHT' */
    #[ORM\Column(type: 'string', length: 12)]
    private string $kind;

    #[ORM\Column(name: 'base_amount', type: 'decimal', precision: 15, scale: 2)]
    private string $baseAmount = '0.00';

    #[ORM\Column(type: 'decimal', precision: 6, scale: 4)]
    private string $rate = '0.0000';

    #[ORM\Column(name: 'tax_amount', type: 'decimal', precision: 15, scale: 2)]
    private string $taxAmount = '0.00';

    #[ORM\Column(type: 'string', length: 150, nullable: true)]
    private ?string $party = null;

    #[ORM\Column(type: 'string', length: 100, nullable: true)]
    private ?string $reference = null;

    #[ORM\Column(name: 'txn_date', type: 'date')]
    private \DateTimeInterface $txnDate;

    #[ORM\Column(name: 'period_year', type: 'string', length: 4)]
    private string $periodYear;

    #[ORM\Column(name: 'period_month', type: 'string', length: 2)]
    private string $periodMonth;

    /** 'pending' | 'remitted' */
    #[ORM\Column(type: 'string', length: 20)]
    private string $status = 'pending';

    #[ORM\Column(name: 'callback_ref', type: 'string', length: 100, nullable: true)]
    private ?string $callbackRef = null;

    #[ORM\Column(type: 'string', length: 36, nullable: true)]
    private ?string $createdBy = null;

    public function __construct() { $this->id = Uuid::uuid4()->toString(); }

    public function getId(): string { return $this->id; }
    public function getKind(): string { return $this->kind; }
    public function setKind(string $v): void { $this->kind = $v; }
    public function getBaseAmount(): string { return $this->baseAmount; }
    public function setBaseAmount(string $v): void { $this->baseAmount = $v; }
    public function getRate(): string { return $this->rate; }
    public function setRate(string $v): void { $this->rate = $v; }
    public function getTaxAmount(): string { return $this->taxAmount; }
    public function setTaxAmount(string $v): void { $this->taxAmount = $v; }
    public function getParty(): ?string { return $this->party; }
    public function setParty(?string $v): void { $this->party = $v; }
    public function getReference(): ?string { return $this->reference; }
    public function setReference(?string $v): void { $this->reference = $v; }
    public function getTxnDate(): \DateTimeInterface { return $this->txnDate; }
    public function setTxnDate(\DateTimeInterface $v): void { $this->txnDate = $v; }
    public function getPeriodYear(): string { return $this->periodYear; }
    public function setPeriodYear(string $v): void { $this->periodYear = $v; }
    public function getPeriodMonth(): string { return $this->periodMonth; }
    public function setPeriodMonth(string $v): void { $this->periodMonth = $v; }
    public function getStatus(): string { return $this->status; }
    public function setStatus(string $v): void { $this->status = $v; }
    public function getCallbackRef(): ?string { return $this->callbackRef; }
    public function setCallbackRef(?string $v): void { $this->callbackRef = $v; }
    public function getCreatedBy(): ?string { return $this->createdBy; }
    public function setCreatedBy(?string $v): void { $this->createdBy = $v; }

    public function toArray(): array
    {
        return [
            'id'           => $this->id,
            'kind'         => $this->kind,
            'base_amount'  => $this->baseAmount,
            'rate'         => $this->rate,
            'tax_amount'   => $this->taxAmount,
            'party'        => $this->party,
            'reference'    => $this->reference,
            'txn_date'     => $this->txnDate->format('Y-m-d'),
            'period'       => $this->periodYear . '-' . $this->periodMonth,
            'status'       => $this->status,
            'created_at'   => $this->createdAt->format('Y-m-d H:i:s'),
        ];
    }
}
