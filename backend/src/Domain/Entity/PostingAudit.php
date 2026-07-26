<?php

declare(strict_types=1);

namespace App\Domain\Entity;

use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

/**
 * Forensic record of a posting whose accounting date differs from the current
 * one — the §9 audit trail for backdated (and date-overridden) entries.
 *
 * Table name follows the spec (transaction_audit); the transaction identity is
 * CreditX's JournalEntry id, since that is the header every posting already
 * hangs off, rather than inventing a parallel identifier.
 *
 * Complements rather than replaces the existing audit_logs: AuditService
 * records WHAT changed on an entity, this records WHEN a financial entry was
 * dated versus when it was really keyed, by whom, from where. Rows are only
 * ever inserted — nothing here is updated or deleted (§9).
 */
#[ORM\Entity]
#[ORM\Table(name: 'transaction_audit')]
#[ORM\Index(name: 'idx_txn_audit_journal', columns: ['journal_entry_id'])]
#[ORM\Index(name: 'idx_txn_audit_posting_date', columns: ['posting_date'])]
#[ORM\Index(name: 'idx_txn_audit_user', columns: ['user_id'])]
class PostingAudit
{
    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    /** The JournalEntry this posting created. */
    #[ORM\Column(name: 'journal_entry_id', type: 'string', length: 36, nullable: true)]
    private ?string $journalEntryId = null;

    /** The accounting date the entry was posted to. */
    #[ORM\Column(name: 'posting_date', type: 'date_immutable')]
    private \DateTimeImmutable $postingDate;

    /** The accounting date that was current at the time — what it would have used. */
    #[ORM\Column(name: 'accounting_date', type: 'date_immutable', nullable: true)]
    private ?\DateTimeImmutable $accountingDate = null;

    /** Real server timestamp. Never overwritten (§3). */
    #[ORM\Column(name: 'created_timestamp', type: 'datetime_immutable')]
    private \DateTimeImmutable $createdTimestamp;

    #[ORM\Column(name: 'user_id', type: 'string', length: 36, nullable: true)]
    private ?string $userId = null;

    /** Set when the backdated posting went through the approval workflow (§10). */
    #[ORM\Column(name: 'approval_user_id', type: 'string', length: 36, nullable: true)]
    private ?string $approvalUserId = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $reason = null;

    /** Populated when an existing entry's date was amended. */
    #[ORM\Column(name: 'previous_posting_date', type: 'date_immutable', nullable: true)]
    private ?\DateTimeImmutable $previousPostingDate = null;

    #[ORM\Column(name: 'ip_address', type: 'string', length: 45, nullable: true)]
    private ?string $ipAddress = null;

    #[ORM\Column(type: 'string', length: 50, nullable: true)]
    private ?string $device = null;

    #[ORM\Column(type: 'string', length: 50, nullable: true)]
    private ?string $browser = null;

    /** How many days before the accounting date this landed (0 = same day). */
    #[ORM\Column(name: 'backdated_days', type: 'integer', options: ['default' => 0])]
    private int $backdatedDays = 0;

    /** Entry type of the journal, denormalised so the log reads without a join. */
    #[ORM\Column(name: 'entry_type', type: 'string', length: 40, nullable: true)]
    private ?string $entryType = null;

    #[ORM\Column(type: 'string', length: 500, nullable: true)]
    private ?string $narration = null;

    public function __construct()
    {
        $this->id = Uuid::uuid4()->toString();
        $this->createdTimestamp = new \DateTimeImmutable();
        $this->postingDate = new \DateTimeImmutable('today');
    }

    public function getId(): string { return $this->id; }

    public function getJournalEntryId(): ?string { return $this->journalEntryId; }
    public function setJournalEntryId(?string $v): void { $this->journalEntryId = $v; }

    public function getPostingDate(): \DateTimeImmutable { return $this->postingDate; }
    public function setPostingDate(\DateTimeImmutable $v): void { $this->postingDate = $v; }

    public function getAccountingDate(): ?\DateTimeImmutable { return $this->accountingDate; }
    public function setAccountingDate(?\DateTimeImmutable $v): void { $this->accountingDate = $v; }

    public function getCreatedTimestamp(): \DateTimeImmutable { return $this->createdTimestamp; }

    public function getUserId(): ?string { return $this->userId; }
    public function setUserId(?string $v): void { $this->userId = $v; }

    public function getApprovalUserId(): ?string { return $this->approvalUserId; }
    public function setApprovalUserId(?string $v): void { $this->approvalUserId = $v; }

    public function getReason(): ?string { return $this->reason; }
    public function setReason(?string $v): void { $this->reason = $v; }

    public function getPreviousPostingDate(): ?\DateTimeImmutable { return $this->previousPostingDate; }
    public function setPreviousPostingDate(?\DateTimeImmutable $v): void { $this->previousPostingDate = $v; }

    public function getIpAddress(): ?string { return $this->ipAddress; }
    public function setIpAddress(?string $v): void { $this->ipAddress = $v; }

    public function getDevice(): ?string { return $this->device; }
    public function setDevice(?string $v): void { $this->device = $v; }

    public function getBrowser(): ?string { return $this->browser; }
    public function setBrowser(?string $v): void { $this->browser = $v; }

    public function getBackdatedDays(): int { return $this->backdatedDays; }
    public function setBackdatedDays(int $v): void { $this->backdatedDays = $v; }

    public function getEntryType(): ?string { return $this->entryType; }
    public function setEntryType(?string $v): void { $this->entryType = $v; }

    public function getNarration(): ?string { return $this->narration; }
    public function setNarration(?string $v): void { $this->narration = $v; }

    public function toArray(): array
    {
        return [
            'id'                    => $this->id,
            'journal_entry_id'      => $this->journalEntryId,
            'posting_date'          => $this->postingDate->format('Y-m-d'),
            'accounting_date'       => $this->accountingDate?->format('Y-m-d'),
            'created_timestamp'     => $this->createdTimestamp->format('Y-m-d H:i:s'),
            'user_id'               => $this->userId,
            'approval_user_id'      => $this->approvalUserId,
            'reason'                => $this->reason,
            'previous_posting_date' => $this->previousPostingDate?->format('Y-m-d'),
            'ip_address'            => $this->ipAddress,
            'device'                => $this->device,
            'browser'               => $this->browser,
            'backdated_days'        => $this->backdatedDays,
            'entry_type'            => $this->entryType,
            'narration'             => $this->narration,
        ];
    }
}
