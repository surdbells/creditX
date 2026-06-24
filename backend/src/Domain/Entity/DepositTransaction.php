<?php

declare(strict_types=1);

namespace App\Domain\Entity;

use App\Domain\Enum\DepositTransactionType;
use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

/**
 * A single movement on a deposit account (the subsidiary-ledger row that
 * sits alongside the GL journal it produced). Each DepositTransaction is
 * backed by exactly one balanced JournalEntry posted via
 * LedgerService::postJournal, so the deposit sub-ledger and the GL never
 * drift: this row records the customer-facing view (running balance,
 * statement line) while the JournalEntry records the double-entry.
 */
#[ORM\Entity]
#[ORM\Table(name: 'deposit_transactions')]
#[ORM\Index(name: 'idx_deposit_txns_account', columns: ['account_id'])]
#[ORM\Index(name: 'idx_deposit_txns_journal', columns: ['journal_entry_id'])]
#[ORM\Index(name: 'idx_deposit_txns_posting_date', columns: ['posting_date'])]
#[ORM\HasLifecycleCallbacks]
class DepositTransaction
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\ManyToOne(targetEntity: DepositAccount::class)]
    #[ORM\JoinColumn(name: 'account_id', referencedColumnName: 'id', nullable: false)]
    private DepositAccount $account;

    #[ORM\ManyToOne(targetEntity: JournalEntry::class)]
    #[ORM\JoinColumn(name: 'journal_entry_id', referencedColumnName: 'id', nullable: false)]
    private JournalEntry $journalEntry;

    #[ORM\Column(type: 'string', length: 20, enumType: DepositTransactionType::class)]
    private DepositTransactionType $type;

    /** Positive magnitude of the movement. Direction is implied by `type`. */
    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)]
    private string $amount;

    /** Account balance immediately after this transaction (statement running balance). */
    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)]
    private string $balanceAfter;

    #[ORM\Column(type: 'string', length: 255)]
    private string $narration;

    #[ORM\Column(type: 'string', length: 100, nullable: true)]
    private ?string $reference = null;

    #[ORM\Column(type: 'date_immutable')]
    private \DateTimeImmutable $postingDate;

    public function __construct()
    {
        $this->id = Uuid::uuid4()->toString();
    }

    public function getId(): string { return $this->id; }
    public function getAccount(): DepositAccount { return $this->account; }
    public function setAccount(DepositAccount $v): void { $this->account = $v; }
    public function getJournalEntry(): JournalEntry { return $this->journalEntry; }
    public function setJournalEntry(JournalEntry $v): void { $this->journalEntry = $v; }
    public function getType(): DepositTransactionType { return $this->type; }
    public function setType(DepositTransactionType $v): void { $this->type = $v; }
    public function getAmount(): string { return $this->amount; }
    public function setAmount(string $v): void { $this->amount = $v; }
    public function getBalanceAfter(): string { return $this->balanceAfter; }
    public function setBalanceAfter(string $v): void { $this->balanceAfter = $v; }
    public function getNarration(): string { return $this->narration; }
    public function setNarration(string $v): void { $this->narration = trim($v); }
    public function getReference(): ?string { return $this->reference; }
    public function setReference(?string $v): void { $this->reference = $v; }
    public function getPostingDate(): \DateTimeImmutable { return $this->postingDate; }
    public function setPostingDate(\DateTimeImmutable $v): void { $this->postingDate = $v; }

    public function toArray(): array
    {
        return [
            'id'               => $this->id,
            'account_id'       => $this->account->getId(),
            'account_number'   => $this->account->getAccountNumber(),
            'journal_entry_id' => $this->journalEntry->getId(),
            'type'             => $this->type->value,
            'amount'           => $this->amount,
            'balance_after'    => $this->balanceAfter,
            'narration'        => $this->narration,
            'reference'        => $this->reference,
            'posting_date'     => $this->postingDate->format('Y-m-d'),
            'created_at'       => $this->createdAt->format('Y-m-d H:i:s'),
        ];
    }
}
