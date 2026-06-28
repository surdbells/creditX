<?php
declare(strict_types=1);
namespace App\Domain\Entity;

use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

/**
 * BankStatementLine — one imported row from a bank statement.
 *
 * `amount` is signed in BANK-ledger terms: positive = money INTO the
 * account (a bank credit; matches a ledger DR on the bank GL), negative =
 * money OUT (a bank debit; matches a ledger CR). A line is matched to at
 * most one BANK-GL ledger transaction; unmatched lines are the outstanding
 * items that explain the book-vs-statement difference.
 */
#[ORM\Entity]
#[ORM\Table(name: 'bank_statement_lines')]
#[ORM\Index(name: 'idx_bankline_recon', columns: ['reconciliation_id'])]
#[ORM\Index(name: 'idx_bankline_matched', columns: ['matched_ledger_transaction_id'])]
#[ORM\HasLifecycleCallbacks]
class BankStatementLine
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\ManyToOne(targetEntity: BankReconciliation::class, inversedBy: 'lines')]
    #[ORM\JoinColumn(name: 'reconciliation_id', referencedColumnName: 'id', nullable: false)]
    private BankReconciliation $reconciliation;

    #[ORM\Column(type: 'date')]
    private \DateTimeInterface $valueDate;

    #[ORM\Column(type: 'string', length: 500)]
    private string $description = '';

    #[ORM\Column(type: 'string', length: 100, nullable: true)]
    private ?string $reference = null;

    /** Signed amount in bank-ledger terms (+in / -out). */
    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)]
    private string $amount = '0.00';

    /** 'unmatched' | 'matched' | 'ignored' */
    #[ORM\Column(type: 'string', length: 20)]
    private string $status = 'unmatched';

    #[ORM\Column(name: 'matched_ledger_transaction_id', type: 'string', length: 36, nullable: true)]
    private ?string $matchedLedgerTransactionId = null;

    public function __construct() { $this->id = Uuid::uuid4()->toString(); }

    public function getId(): string { return $this->id; }
    public function getReconciliation(): BankReconciliation { return $this->reconciliation; }
    public function setReconciliation(BankReconciliation $v): void { $this->reconciliation = $v; }
    public function getValueDate(): \DateTimeInterface { return $this->valueDate; }
    public function setValueDate(\DateTimeInterface $v): void { $this->valueDate = $v; }
    public function getDescription(): string { return $this->description; }
    public function setDescription(string $v): void { $this->description = mb_substr($v, 0, 500); }
    public function getReference(): ?string { return $this->reference; }
    public function setReference(?string $v): void { $this->reference = $v !== null ? mb_substr($v, 0, 100) : null; }
    public function getAmount(): string { return $this->amount; }
    public function setAmount(string $v): void { $this->amount = $v; }
    public function getStatus(): string { return $this->status; }
    public function setStatus(string $v): void { $this->status = $v; }
    public function getMatchedLedgerTransactionId(): ?string { return $this->matchedLedgerTransactionId; }
    public function setMatchedLedgerTransactionId(?string $v): void { $this->matchedLedgerTransactionId = $v; }

    public function isMatched(): bool { return $this->status === 'matched'; }

    public function toArray(): array
    {
        return [
            'id'             => $this->id,
            'value_date'     => $this->valueDate->format('Y-m-d'),
            'description'    => $this->description,
            'reference'      => $this->reference,
            'amount'         => $this->amount,
            'status'         => $this->status,
            'matched_ledger_transaction_id' => $this->matchedLedgerTransactionId,
        ];
    }
}
