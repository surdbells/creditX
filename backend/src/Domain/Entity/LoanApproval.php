<?php

declare(strict_types=1);

namespace App\Domain\Entity;

use App\Domain\Enum\ApprovalStatus;
use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

#[ORM\Entity(repositoryClass: \App\Domain\Repository\LoanApprovalRepository::class)]
#[ORM\Table(name: 'loan_approvals')]
#[ORM\Index(name: 'idx_loan_approvals_loan', columns: ['loan_id'])]
#[ORM\Index(name: 'idx_loan_approvals_status', columns: ['status'])]
#[ORM\HasLifecycleCallbacks]
class LoanApproval
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\ManyToOne(targetEntity: Loan::class)]
    #[ORM\JoinColumn(name: 'loan_id', referencedColumnName: 'id', nullable: false)]
    private Loan $loan;

    #[ORM\ManyToOne(targetEntity: ApprovalStep::class)]
    #[ORM\JoinColumn(name: 'step_id', referencedColumnName: 'id', nullable: false)]
    private ApprovalStep $step;

    /** The actual user who acted (null if pending) */
    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(name: 'approver_id', referencedColumnName: 'id', nullable: true)]
    private ?User $approver = null;

    #[ORM\Column(type: 'string', length: 20, enumType: ApprovalStatus::class)]
    private ApprovalStatus $status = ApprovalStatus::PENDING;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $comment = null;

    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $decidedAt = null;

    /** Tracks when the SLA window started (for escalation) */
    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $slaStartedAt = null;

    /** Whether SLA was breached */
    #[ORM\Column(type: 'boolean', options: ['default' => false])]
    private bool $slaBreached = false;

    public function __construct()
    {
        $this->id = Uuid::uuid4()->toString();
    }

    public function getId(): string { return $this->id; }
    public function getLoan(): Loan { return $this->loan; }
    public function setLoan(Loan $v): void { $this->loan = $v; }
    public function getStep(): ApprovalStep { return $this->step; }
    public function setStep(ApprovalStep $v): void { $this->step = $v; }
    public function getApprover(): ?User { return $this->approver; }
    public function setApprover(?User $v): void { $this->approver = $v; }
    public function getStatus(): ApprovalStatus { return $this->status; }
    public function getComment(): ?string { return $this->comment; }
    public function getDecidedAt(): ?\DateTimeImmutable { return $this->decidedAt; }
    public function getSlaStartedAt(): ?\DateTimeImmutable { return $this->slaStartedAt; }
    public function setSlaStartedAt(?\DateTimeImmutable $v): void { $this->slaStartedAt = $v; }
    public function isSlaBreached(): bool { return $this->slaBreached; }
    public function setSlaBreached(bool $v): void { $this->slaBreached = $v; }

    /**
     * Record an approval decision.
     */
    public function approve(User $approver, ?string $comment = null): void
    {
        $this->status = ApprovalStatus::APPROVED;
        $this->approver = $approver;
        $this->comment = $comment;
        $this->decidedAt = new \DateTimeImmutable('now', new \DateTimeZone($_ENV['APP_TIMEZONE'] ?? 'Africa/Lagos'));
    }

    /**
     * Record a rejection decision.
     */
    public function reject(User $approver, ?string $comment = null): void
    {
        $this->status = ApprovalStatus::REJECTED;
        $this->approver = $approver;
        $this->comment = $comment;
        $this->decidedAt = new \DateTimeImmutable('now', new \DateTimeZone($_ENV['APP_TIMEZONE'] ?? 'Africa/Lagos'));
    }

    /**
     * Auto-approve (SLA escalation).
     */
    public function autoApprove(): void
    {
        $this->status = ApprovalStatus::AUTO_APPROVED;
        $this->comment = 'Auto-approved due to SLA breach';
        $this->decidedAt = new \DateTimeImmutable('now', new \DateTimeZone($_ENV['APP_TIMEZONE'] ?? 'Africa/Lagos'));
        $this->slaBreached = true;
    }

    /**
     * Mark as escalated.
     */
    public function escalate(): void
    {
        $this->status = ApprovalStatus::ESCALATED;
        $this->slaBreached = true;
    }

    public function isPending(): bool
    {
        return $this->status === ApprovalStatus::PENDING;
    }

    public function isDecided(): bool
    {
        return in_array($this->status, [
            ApprovalStatus::APPROVED, ApprovalStatus::REJECTED,
            ApprovalStatus::AUTO_APPROVED, ApprovalStatus::SKIPPED,
        ], true);
    }

    public function toArray(): array
    {
        return [
            'id'              => $this->id,
            'loan_id'         => $this->loan->getId(),
            'step_id'         => $this->step->getId(),
            'step_name'       => $this->step->getName(),
            'step_order'      => $this->step->getStepOrder(),
            'role_name'       => $this->step->getRole()->getName(),
            'role_slug'       => $this->step->getRole()->getSlug(),
            'approver_id'     => $this->approver?->getId(),
            'approver_name'   => $this->approver?->getFullName(),
            'status'          => $this->status->value,
            'comment'         => $this->comment,
            'is_mandatory'    => $this->step->isMandatory(),
            'sla_hours'       => $this->step->getSlaHours(),
            'sla_started_at'  => $this->slaStartedAt?->format('Y-m-d H:i:s'),
            'sla_breached'    => $this->slaBreached,
            'decided_at'      => $this->decidedAt?->format('Y-m-d H:i:s'),
            'created_at'      => $this->createdAt->format('Y-m-d H:i:s'),
        ];
    }
}
