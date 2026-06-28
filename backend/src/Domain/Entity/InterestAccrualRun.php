<?php
declare(strict_types=1);
namespace App\Domain\Entity;

use App\Domain\Enum\ProvisionStatus;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

/**
 * InterestAccrualRun — header for one monthly loan-interest accrual cycle.
 *
 * Accrual recognises the interest a loan earns over time rather than only
 * when the customer pays. For each performing loan we book the scheduled
 * interest of the installments falling in the period:
 *
 *   DR Interest Receivable (INTRECV)   CR Interest Income (II)
 *
 * For non-performing loans (90+ DPD) interest is suspended — accrued to a
 * contra account instead of income, so it doesn't inflate the P&L:
 *
 *   DR Interest Receivable (INTRECV)   CR Interest in Suspense (INTSUSP)
 *
 * RepaymentService later clears INTRECV as cash comes in (and releases
 * INTSUSP to income for collected suspended interest).
 *
 * ## Lifecycle (reuses ProvisionStatus)
 *   POSTED   — journal in the GL; one POSTED run per (year, month).
 *   REVERSED — unwound via the reversal pattern; a fresh run may then
 *              re-accrue the period.
 *
 * ## Suspension policy
 *   Suspension is PROSPECTIVE: interest earned while the loan was
 *   performing stays recognised; only interest accrued once the loan is
 *   non-performing is parked in suspense.
 */
#[ORM\Entity]
#[ORM\Table(name: 'interest_accrual_runs')]
#[ORM\Index(name: 'idx_accrual_period_status', columns: ['period_year', 'period_month', 'status'])]
#[ORM\HasLifecycleCallbacks]
class InterestAccrualRun
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\Column(name: 'period_year', type: 'string', length: 4)]
    private string $periodYear;

    #[ORM\Column(name: 'period_month', type: 'string', length: 2)]
    private string $periodMonth;

    /** Effective posting date — last day of the accrual period. */
    #[ORM\Column(type: 'date')]
    private \DateTimeInterface $postingDate;

    #[ORM\Column(type: 'string', length: 20, enumType: ProvisionStatus::class)]
    private ProvisionStatus $status = ProvisionStatus::POSTED;

    /** Callback ref grouping every posted ledger entry for this run. */
    #[ORM\Column(type: 'string', length: 100, nullable: true)]
    private ?string $callbackRef = null;

    /** Interest recognised to income this run (performing loans). */
    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)]
    private string $totalIncomeAccrued = '0.00';

    /** Interest parked in suspense this run (non-performing loans). */
    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)]
    private string $totalSuspended = '0.00';

    #[ORM\Column(type: 'integer')]
    private int $loanCount = 0;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $notes = null;

    #[ORM\Column(type: 'string', length: 36, nullable: true)]
    private ?string $createdBy = null;

    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $reversedAt = null;

    #[ORM\Column(type: 'string', length: 36, nullable: true)]
    private ?string $reversedBy = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $reversalReason = null;

    /** @var Collection<int, InterestAccrualLine> */
    #[ORM\OneToMany(targetEntity: InterestAccrualLine::class, mappedBy: 'run', cascade: ['persist', 'remove'], orphanRemoval: true)]
    private Collection $lines;

    public function __construct()
    {
        $this->id = Uuid::uuid4()->toString();
        $this->lines = new ArrayCollection();
    }

    public function getId(): string { return $this->id; }
    public function getPeriodYear(): string { return $this->periodYear; }
    public function setPeriodYear(string $v): void { $this->periodYear = $v; }
    public function getPeriodMonth(): string { return $this->periodMonth; }
    public function setPeriodMonth(string $v): void { $this->periodMonth = $v; }
    public function getPostingDate(): \DateTimeInterface { return $this->postingDate; }
    public function setPostingDate(\DateTimeInterface $v): void { $this->postingDate = $v; }
    public function getStatus(): ProvisionStatus { return $this->status; }
    public function setStatus(ProvisionStatus $v): void { $this->status = $v; }
    public function isPosted(): bool { return $this->status === ProvisionStatus::POSTED; }
    public function isReversed(): bool { return $this->status === ProvisionStatus::REVERSED; }
    public function getCallbackRef(): ?string { return $this->callbackRef; }
    public function setCallbackRef(?string $v): void { $this->callbackRef = $v; }
    public function getTotalIncomeAccrued(): string { return $this->totalIncomeAccrued; }
    public function setTotalIncomeAccrued(string $v): void { $this->totalIncomeAccrued = $v; }
    public function getTotalSuspended(): string { return $this->totalSuspended; }
    public function setTotalSuspended(string $v): void { $this->totalSuspended = $v; }
    public function getLoanCount(): int { return $this->loanCount; }
    public function setLoanCount(int $v): void { $this->loanCount = $v; }
    public function getNotes(): ?string { return $this->notes; }
    public function setNotes(?string $v): void { $this->notes = $v; }
    public function getCreatedBy(): ?string { return $this->createdBy; }
    public function setCreatedBy(?string $v): void { $this->createdBy = $v; }
    public function getReversedAt(): ?\DateTimeImmutable { return $this->reversedAt; }
    public function setReversedAt(?\DateTimeImmutable $v): void { $this->reversedAt = $v; }
    public function getReversedBy(): ?string { return $this->reversedBy; }
    public function setReversedBy(?string $v): void { $this->reversedBy = $v; }
    public function getReversalReason(): ?string { return $this->reversalReason; }
    public function setReversalReason(?string $v): void { $this->reversalReason = $v; }

    /** @return Collection<int, InterestAccrualLine> */
    public function getLines(): Collection { return $this->lines; }
    public function addLine(InterestAccrualLine $line): void
    {
        $line->setRun($this);
        $this->lines->add($line);
    }

    public function getLabel(): string
    {
        return $this->periodYear . '-' . $this->periodMonth;
    }

    public function toArray(bool $includeLines = false): array
    {
        $data = [
            'id'                   => $this->id,
            'period_year'          => $this->periodYear,
            'period_month'         => $this->periodMonth,
            'period'               => $this->getLabel(),
            'posting_date'         => $this->postingDate->format('Y-m-d'),
            'status'               => $this->status->value,
            'callback_ref'         => $this->callbackRef,
            'total_income_accrued' => $this->totalIncomeAccrued,
            'total_suspended'      => $this->totalSuspended,
            'loan_count'           => $this->loanCount,
            'notes'                => $this->notes,
            'created_by'           => $this->createdBy,
            'created_at'           => $this->createdAt->format('Y-m-d H:i:s'),
            'reversed_at'          => $this->reversedAt?->format('Y-m-d H:i:s'),
            'reversed_by'          => $this->reversedBy,
            'reversal_reason'      => $this->reversalReason,
        ];
        if ($includeLines) {
            $data['lines'] = $this->lines->map(fn(InterestAccrualLine $l) => $l->toArray())->toArray();
        }
        return $data;
    }
}
