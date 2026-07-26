<?php

declare(strict_types=1);

namespace App\Domain\Entity;

use App\Domain\Enum\BusinessDateStatus;
use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

/**
 * One business date in the accounting calendar — the operational layer of
 * period control, advanced by the End-of-Day process.
 *
 * This sits BELOW the existing monthly AccountingPeriod rather than replacing
 * it. A posting must satisfy both:
 *   - its business date is OPEN here (daily / operational), and
 *   - its month is not CLOSED in accounting_periods (financial close to
 *     retained earnings).
 * Keeping them separate means a normal day's EOD never touches the P&L close,
 * and month-end close still works exactly as it does today.
 *
 * Rows are created lazily: dates the calendar has never seen are treated as
 * FUTURE if ahead of the current accounting date, and as OPEN-but-unrecorded
 * if behind it — which keeps every pre-existing transaction valid without a
 * backfill (§17: backward compatibility).
 */
#[ORM\Entity]
#[ORM\Table(name: 'accounting_calendar')]
#[ORM\UniqueConstraint(name: 'uniq_accounting_calendar_date', columns: ['business_date'])]
#[ORM\Index(name: 'idx_accounting_calendar_status', columns: ['status'])]
#[ORM\HasLifecycleCallbacks]
class AccountingCalendar
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\Column(name: 'business_date', type: 'date_immutable', unique: true)]
    private \DateTimeImmutable $businessDate;

    #[ORM\Column(type: 'string', length: 20, enumType: BusinessDateStatus::class)]
    private BusinessDateStatus $status = BusinessDateStatus::FUTURE;

    #[ORM\Column(name: 'opened_by', type: 'string', length: 36, nullable: true)]
    private ?string $openedBy = null;

    #[ORM\Column(name: 'opened_at', type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $openedAt = null;

    #[ORM\Column(name: 'closed_by', type: 'string', length: 36, nullable: true)]
    private ?string $closedBy = null;

    #[ORM\Column(name: 'closed_at', type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $closedAt = null;

    /** Set while EOD holds this date, so a crashed run is identifiable. */
    #[ORM\Column(name: 'eod_started_at', type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $eodStartedAt = null;

    #[ORM\Column(name: 'eod_completed_at', type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $eodCompletedAt = null;

    /** Step-by-step outcome of the last EOD attempt, for the run log. */
    #[ORM\Column(name: 'eod_result', type: 'json', nullable: true)]
    private ?array $eodResult = null;

    /** How many times this date has been reopened after closing. */
    #[ORM\Column(name: 'reopen_count', type: 'integer', options: ['default' => 0])]
    private int $reopenCount = 0;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $notes = null;

    public function __construct(?\DateTimeImmutable $businessDate = null)
    {
        $this->id = Uuid::uuid4()->toString();
        $this->businessDate = $businessDate ?? new \DateTimeImmutable('today');
    }

    public function getId(): string { return $this->id; }

    public function getBusinessDate(): \DateTimeImmutable { return $this->businessDate; }
    public function setBusinessDate(\DateTimeImmutable $v): void { $this->businessDate = $v; }
    public function getDateString(): string { return $this->businessDate->format('Y-m-d'); }

    public function getStatus(): BusinessDateStatus { return $this->status; }
    public function setStatus(BusinessDateStatus $v): void { $this->status = $v; }

    public function getOpenedBy(): ?string { return $this->openedBy; }
    public function setOpenedBy(?string $v): void { $this->openedBy = $v; }
    public function getOpenedAt(): ?\DateTimeImmutable { return $this->openedAt; }
    public function setOpenedAt(?\DateTimeImmutable $v): void { $this->openedAt = $v; }

    public function getClosedBy(): ?string { return $this->closedBy; }
    public function setClosedBy(?string $v): void { $this->closedBy = $v; }
    public function getClosedAt(): ?\DateTimeImmutable { return $this->closedAt; }
    public function setClosedAt(?\DateTimeImmutable $v): void { $this->closedAt = $v; }

    public function getEodStartedAt(): ?\DateTimeImmutable { return $this->eodStartedAt; }
    public function setEodStartedAt(?\DateTimeImmutable $v): void { $this->eodStartedAt = $v; }
    public function getEodCompletedAt(): ?\DateTimeImmutable { return $this->eodCompletedAt; }
    public function setEodCompletedAt(?\DateTimeImmutable $v): void { $this->eodCompletedAt = $v; }
    public function getEodResult(): ?array { return $this->eodResult; }
    public function setEodResult(?array $v): void { $this->eodResult = $v; }

    public function getReopenCount(): int { return $this->reopenCount; }
    public function incrementReopenCount(): void { $this->reopenCount++; }

    public function getNotes(): ?string { return $this->notes; }
    public function setNotes(?string $v): void { $this->notes = $v; }

    public function isOpen(): bool { return $this->status === BusinessDateStatus::OPEN; }
    public function isClosed(): bool { return $this->status === BusinessDateStatus::CLOSED; }
    public function isProcessing(): bool { return $this->status === BusinessDateStatus::PROCESSING; }

    /** Mark OPEN, stamping who opened it and when (EOD, or the initial seed). */
    public function open(?string $userId): void
    {
        $this->status = BusinessDateStatus::OPEN;
        $this->openedBy = $userId;
        $this->openedAt = new \DateTimeImmutable();
    }

    public function close(?string $userId): void
    {
        $this->status = BusinessDateStatus::CLOSED;
        $this->closedBy = $userId;
        $this->closedAt = new \DateTimeImmutable();
    }

    public function toArray(): array
    {
        return [
            'id'               => $this->id,
            'business_date'    => $this->getDateString(),
            'status'           => $this->status->value,
            'status_label'     => $this->status->label(),
            'tone'             => $this->status->tone(),
            'opened_by'        => $this->openedBy,
            'opened_at'        => $this->openedAt?->format('Y-m-d H:i:s'),
            'closed_by'        => $this->closedBy,
            'closed_at'        => $this->closedAt?->format('Y-m-d H:i:s'),
            'eod_started_at'   => $this->eodStartedAt?->format('Y-m-d H:i:s'),
            'eod_completed_at' => $this->eodCompletedAt?->format('Y-m-d H:i:s'),
            'eod_result'       => $this->eodResult,
            'reopen_count'     => $this->reopenCount,
            'notes'            => $this->notes,
        ];
    }
}
