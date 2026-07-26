<?php

declare(strict_types=1);

namespace App\Domain\Entity;

use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

/**
 * A manager's authorisation for one user to post to one earlier business date
 * (§10).
 *
 * ## Why pre-authorisation rather than a queue of held transactions
 *
 * The spec describes the transaction itself entering Pending Approval and
 * posting on approval. Doing that literally would mean serialising an arbitrary
 * in-flight operation — a disbursement carries schedule generation, a repayment
 * carries allocation across installments — and replaying it later against data
 * that may have moved. That is fragile in exactly the place it must not be.
 *
 * This inverts it: the OPERATOR is approved for the date, then posts normally.
 * The control objective is identical — no backdated entry reaches the ledger
 * without a manager's decision — but nothing is held in limbo, every posting
 * still runs its own validation at the moment it happens, and a stale approval
 * cannot resurrect a transaction whose preconditions have changed.
 *
 * An approval is single-use by default (consumed by the first posting that
 * relies on it) and expires, so it cannot become a standing licence.
 */
#[ORM\Entity]
#[ORM\Table(name: 'backdate_approvals')]
#[ORM\Index(name: 'idx_backdate_appr_status', columns: ['status'])]
#[ORM\Index(name: 'idx_backdate_appr_lookup', columns: ['requested_by', 'business_date', 'status'])]
#[ORM\HasLifecycleCallbacks]
class BackdateApproval
{
    use TimestampsTrait;

    public const STATUS_PENDING  = 'pending';
    public const STATUS_APPROVED = 'approved';
    public const STATUS_REJECTED = 'rejected';
    public const STATUS_USED     = 'used';
    public const STATUS_EXPIRED  = 'expired';

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\Column(name: 'requested_by', type: 'string', length: 36)]
    private string $requestedBy;

    /** The earlier business date the request is for. */
    #[ORM\Column(name: 'business_date', type: 'date_immutable')]
    private \DateTimeImmutable $businessDate;

    /** What the operator intends to post — free text, for the approver's context. */
    #[ORM\Column(type: 'text')]
    private string $reason;

    /** Optional module/reference hint (e.g. "Repayment", "APP-2026-00123"). */
    #[ORM\Column(type: 'string', length: 120, nullable: true)]
    private ?string $context = null;

    #[ORM\Column(type: 'string', length: 20)]
    private string $status = self::STATUS_PENDING;

    #[ORM\Column(name: 'decided_by', type: 'string', length: 36, nullable: true)]
    private ?string $decidedBy = null;

    #[ORM\Column(name: 'decided_at', type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $decidedAt = null;

    #[ORM\Column(name: 'decision_note', type: 'text', nullable: true)]
    private ?string $decisionNote = null;

    /** When the approval stops being usable. */
    #[ORM\Column(name: 'expires_at', type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $expiresAt = null;

    /** Stamped when a posting actually relied on this approval. */
    #[ORM\Column(name: 'used_at', type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $usedAt = null;

    #[ORM\Column(name: 'used_journal_id', type: 'string', length: 36, nullable: true)]
    private ?string $usedJournalId = null;

    public function __construct()
    {
        $this->id = Uuid::uuid4()->toString();
        $this->businessDate = new \DateTimeImmutable('today');
    }

    public function getId(): string { return $this->id; }

    public function getRequestedBy(): string { return $this->requestedBy; }
    public function setRequestedBy(string $v): void { $this->requestedBy = $v; }

    public function getBusinessDate(): \DateTimeImmutable { return $this->businessDate; }
    public function setBusinessDate(\DateTimeImmutable $v): void { $this->businessDate = $v; }
    public function getDateString(): string { return $this->businessDate->format('Y-m-d'); }

    public function getReason(): string { return $this->reason; }
    public function setReason(string $v): void { $this->reason = trim($v); }

    public function getContext(): ?string { return $this->context; }
    public function setContext(?string $v): void { $this->context = $v; }

    public function getStatus(): string { return $this->status; }
    public function setStatus(string $v): void { $this->status = $v; }

    public function getDecidedBy(): ?string { return $this->decidedBy; }
    public function getDecidedAt(): ?\DateTimeImmutable { return $this->decidedAt; }
    public function getDecisionNote(): ?string { return $this->decisionNote; }

    public function getExpiresAt(): ?\DateTimeImmutable { return $this->expiresAt; }
    public function setExpiresAt(?\DateTimeImmutable $v): void { $this->expiresAt = $v; }

    public function getUsedAt(): ?\DateTimeImmutable { return $this->usedAt; }
    public function getUsedJournalId(): ?string { return $this->usedJournalId; }

    public function approve(string $userId, ?string $note, \DateTimeImmutable $expiresAt): void
    {
        $this->status = self::STATUS_APPROVED;
        $this->decidedBy = $userId;
        $this->decidedAt = new \DateTimeImmutable();
        $this->decisionNote = $note;
        $this->expiresAt = $expiresAt;
    }

    public function reject(string $userId, ?string $note): void
    {
        $this->status = self::STATUS_REJECTED;
        $this->decidedBy = $userId;
        $this->decidedAt = new \DateTimeImmutable();
        $this->decisionNote = $note;
    }

    public function markUsed(?string $journalId): void
    {
        $this->status = self::STATUS_USED;
        $this->usedAt = new \DateTimeImmutable();
        $this->usedJournalId = $journalId;
    }

    /** Approved, not yet used, and not past its expiry. */
    public function isUsable(): bool
    {
        return $this->status === self::STATUS_APPROVED
            && ($this->expiresAt === null || $this->expiresAt > new \DateTimeImmutable());
    }

    public function toArray(): array
    {
        return [
            'id'             => $this->id,
            'requested_by'   => $this->requestedBy,
            'business_date'  => $this->getDateString(),
            'reason'         => $this->reason,
            'context'        => $this->context,
            'status'         => $this->status,
            'decided_by'     => $this->decidedBy,
            'decided_at'     => $this->decidedAt?->format('Y-m-d H:i:s'),
            'decision_note'  => $this->decisionNote,
            'expires_at'     => $this->expiresAt?->format('Y-m-d H:i:s'),
            'used_at'        => $this->usedAt?->format('Y-m-d H:i:s'),
            'used_journal_id'=> $this->usedJournalId,
            'is_usable'      => $this->isUsable(),
            'created_at'     => $this->createdAt->format('Y-m-d H:i:s'),
        ];
    }
}
