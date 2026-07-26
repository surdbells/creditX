<?php

declare(strict_types=1);

namespace App\Domain\Entity;

use App\Domain\Enum\InvestmentTransactionType;
use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

/**
 * One movement on an investment, mirroring the GL journal it posted. Interest
 * movements carry the gross / WHT / net split so a statement and the WHT
 * remittance report can be built without re-deriving them.
 */
#[ORM\Entity]
#[ORM\Table(name: 'investment_transactions')]
#[ORM\Index(name: 'idx_investment_txns_investment', columns: ['investment_id'])]
#[ORM\Index(name: 'idx_investment_txns_type', columns: ['type'])]
#[ORM\Index(name: 'idx_investment_txns_value_date', columns: ['value_date'])]
#[ORM\HasLifecycleCallbacks]
class InvestmentTransaction
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\ManyToOne(targetEntity: Investment::class)]
    #[ORM\JoinColumn(name: 'investment_id', referencedColumnName: 'id', nullable: false)]
    private Investment $investment;

    #[ORM\Column(type: 'string', length: 20, enumType: InvestmentTransactionType::class)]
    private InvestmentTransactionType $type;

    /** Principal movement, or gross interest for interest movements. Magnitude, positive. */
    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)]
    private string $amount = '0.00';

    /** Interest split (interest movements only; null otherwise). */
    #[ORM\Column(name: 'gross_interest', type: 'decimal', precision: 15, scale: 2, nullable: true)]
    private ?string $grossInterest = null;

    #[ORM\Column(name: 'wht_amount', type: 'decimal', precision: 15, scale: 2, nullable: true)]
    private ?string $whtAmount = null;

    #[ORM\Column(name: 'net_interest', type: 'decimal', precision: 15, scale: 2, nullable: true)]
    private ?string $netInterest = null;

    /** Investment principal balance after this movement. */
    #[ORM\Column(name: 'balance_after', type: 'decimal', precision: 15, scale: 2)]
    private string $balanceAfter = '0.00';

    #[ORM\Column(name: 'value_date', type: 'date_immutable')]
    private \DateTimeImmutable $valueDate;

    #[ORM\Column(type: 'string', length: 500, nullable: true)]
    private ?string $narration = null;

    #[ORM\Column(type: 'string', length: 100, nullable: true)]
    private ?string $reference = null;

    /** The GL JournalEntry this movement posted (null for non-cash records). */
    #[ORM\Column(name: 'journal_entry_id', type: 'string', length: 36, nullable: true)]
    private ?string $journalEntryId = null;

    public function __construct()
    {
        $this->id = Uuid::uuid4()->toString();
        $this->valueDate = new \DateTimeImmutable('today');
    }

    public function getId(): string { return $this->id; }
    public function getInvestment(): Investment { return $this->investment; }
    public function setInvestment(Investment $v): void { $this->investment = $v; }
    public function getType(): InvestmentTransactionType { return $this->type; }
    public function setType(InvestmentTransactionType $v): void { $this->type = $v; }
    public function getAmount(): string { return $this->amount; }
    public function setAmount(string $v): void { $this->amount = $v; }
    public function getGrossInterest(): ?string { return $this->grossInterest; }
    public function setGrossInterest(?string $v): void { $this->grossInterest = $v; }
    public function getWhtAmount(): ?string { return $this->whtAmount; }
    public function setWhtAmount(?string $v): void { $this->whtAmount = $v; }
    public function getNetInterest(): ?string { return $this->netInterest; }
    public function setNetInterest(?string $v): void { $this->netInterest = $v; }
    public function getBalanceAfter(): string { return $this->balanceAfter; }
    public function setBalanceAfter(string $v): void { $this->balanceAfter = $v; }
    public function getValueDate(): \DateTimeImmutable { return $this->valueDate; }
    public function setValueDate(\DateTimeImmutable $v): void { $this->valueDate = $v; }
    public function getNarration(): ?string { return $this->narration; }
    public function setNarration(?string $v): void { $this->narration = $v; }
    public function getReference(): ?string { return $this->reference; }
    public function setReference(?string $v): void { $this->reference = $v; }
    public function getJournalEntryId(): ?string { return $this->journalEntryId; }
    public function setJournalEntryId(?string $v): void { $this->journalEntryId = $v; }

    public function toArray(): array
    {
        return [
            'id'             => $this->id,
            'investment_id'  => $this->investment->getId(),
            'type'           => $this->type->value,
            'amount'         => $this->amount,
            'gross_interest' => $this->grossInterest,
            'wht_amount'     => $this->whtAmount,
            'net_interest'   => $this->netInterest,
            'balance_after'  => $this->balanceAfter,
            'value_date'     => $this->valueDate->format('Y-m-d'),
            'narration'      => $this->narration,
            'reference'      => $this->reference,
            'journal_entry_id' => $this->journalEntryId,
            'created_at'     => $this->createdAt->format('Y-m-d H:i:s'),
        ];
    }
}
