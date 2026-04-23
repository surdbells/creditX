<?php
declare(strict_types=1);
namespace App\Domain\Entity;

use App\Domain\Enum\PeriodStatus;
use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

/**
 * AccountingPeriod — a bounded time window (usually a calendar month)
 * that can be 'open' (accepting postings) or 'closed' (frozen). Once
 * closed, back-dated postings to that period are rejected by the
 * ledger service.
 *
 * Closing a period:
 *   1. Compute net income for the period (income - expense within the
 *      period dates)
 *   2. Post a closing journal: CR Retained Earnings GL, DR each
 *      income account (to zero it), CR each expense account (to zero)
 *   3. Flip status to CLOSED, record closed_at + closed_by
 *
 * Reopening a period:
 *   Admin-only rescue operation. Reverses the closing journal (via
 *   JournalReversalService) and flips status back to OPEN. Used when
 *   a post-close discovery requires amending the period.
 *
 * One period per (year, month) combination — unique constraint. The
 * 'month' boundary is the typical close cycle; longer/shorter periods
 * could be added later if needed.
 */
#[ORM\Entity]
#[ORM\Table(name: 'accounting_periods')]
#[ORM\UniqueConstraint(name: 'uq_ap_year_month', columns: ['year', 'month'])]
#[ORM\HasLifecycleCallbacks]
class AccountingPeriod
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\Column(type: 'string', length: 4)]
    private string $year;

    #[ORM\Column(type: 'string', length: 2)]
    private string $month;

    #[ORM\Column(type: 'string', length: 20, enumType: PeriodStatus::class)]
    private PeriodStatus $status = PeriodStatus::OPEN;

    /** Closing journal callback ref, for audit / reversal reference */
    #[ORM\Column(type: 'string', length: 100, nullable: true)]
    private ?string $closingCallback = null;

    /** Net income as posted by the closing journal */
    #[ORM\Column(type: 'decimal', precision: 15, scale: 2, nullable: true)]
    private ?string $netIncomePosted = null;

    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $closedAt = null;

    #[ORM\Column(type: 'string', length: 36, nullable: true)]
    private ?string $closedBy = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $notes = null;

    public function __construct() { $this->id = Uuid::uuid4()->toString(); }

    public function getId(): string { return $this->id; }
    public function getYear(): string { return $this->year; }
    public function setYear(string $v): void { $this->year = $v; }
    public function getMonth(): string { return $this->month; }
    public function setMonth(string $v): void { $this->month = str_pad($v, 2, '0', STR_PAD_LEFT); }
    public function getStatus(): PeriodStatus { return $this->status; }
    public function setStatus(PeriodStatus $v): void { $this->status = $v; }
    public function getClosingCallback(): ?string { return $this->closingCallback; }
    public function setClosingCallback(?string $v): void { $this->closingCallback = $v; }
    public function getNetIncomePosted(): ?string { return $this->netIncomePosted; }
    public function setNetIncomePosted(?string $v): void { $this->netIncomePosted = $v; }
    public function getClosedAt(): ?\DateTimeImmutable { return $this->closedAt; }
    public function setClosedAt(?\DateTimeImmutable $v): void { $this->closedAt = $v; }
    public function getClosedBy(): ?string { return $this->closedBy; }
    public function setClosedBy(?string $v): void { $this->closedBy = $v; }
    public function getNotes(): ?string { return $this->notes; }
    public function setNotes(?string $v): void { $this->notes = $v; }

    public function isOpen(): bool { return $this->status === PeriodStatus::OPEN; }
    public function isClosed(): bool { return $this->status === PeriodStatus::CLOSED; }

    /**
     * Format as 'YYYY-MM' for display and as a comparable string for
     * date-based period lookups (zero-padded month compares correctly).
     */
    public function getLabel(): string
    {
        return "{$this->year}-{$this->month}";
    }

    public function toArray(): array
    {
        return [
            'id'                 => $this->id,
            'year'               => $this->year,
            'month'              => $this->month,
            'label'              => $this->getLabel(),
            'status'             => $this->status->value,
            'closing_callback'   => $this->closingCallback,
            'net_income_posted'  => $this->netIncomePosted,
            'closed_at'          => $this->closedAt?->format('Y-m-d H:i:s'),
            'closed_by'          => $this->closedBy,
            'notes'              => $this->notes,
            'created_at'         => $this->createdAt->format('Y-m-d H:i:s'),
        ];
    }
}
