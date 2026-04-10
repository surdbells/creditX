<?php
declare(strict_types=1);
namespace App\Domain\Entity;

use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

#[ORM\Entity]
#[ORM\Table(name: 'report_schedules')]
#[ORM\HasLifecycleCallbacks]
class ReportSchedule
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\Column(type: 'string', length: 50)]
    private string $reportType;

    /** daily, weekly, monthly */
    #[ORM\Column(type: 'string', length: 20)]
    private string $frequency;

    /** JSON array of email addresses */
    #[ORM\Column(type: 'json')]
    private array $recipients = [];

    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $lastRunAt = null;

    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $nextRunAt = null;

    #[ORM\Column(type: 'boolean', options: ['default' => true])]
    private bool $isActive = true;

    public function __construct() { $this->id = Uuid::uuid4()->toString(); }

    public function getId(): string { return $this->id; }
    public function getReportType(): string { return $this->reportType; }
    public function setReportType(string $v): void { $this->reportType = $v; }
    public function getFrequency(): string { return $this->frequency; }
    public function setFrequency(string $v): void { $this->frequency = $v; }
    public function getRecipients(): array { return $this->recipients; }
    public function setRecipients(array $v): void { $this->recipients = $v; }
    public function getLastRunAt(): ?\DateTimeImmutable { return $this->lastRunAt; }
    public function setLastRunAt(?\DateTimeImmutable $v): void { $this->lastRunAt = $v; }
    public function getNextRunAt(): ?\DateTimeImmutable { return $this->nextRunAt; }
    public function setNextRunAt(?\DateTimeImmutable $v): void { $this->nextRunAt = $v; }
    public function isActive(): bool { return $this->isActive; }
    public function setIsActive(bool $v): void { $this->isActive = $v; }

    public function toArray(): array
    {
        return [
            'id' => $this->id, 'report_type' => $this->reportType, 'frequency' => $this->frequency,
            'recipients' => $this->recipients, 'last_run_at' => $this->lastRunAt?->format('Y-m-d H:i:s'),
            'next_run_at' => $this->nextRunAt?->format('Y-m-d H:i:s'), 'is_active' => $this->isActive,
            'created_at' => $this->createdAt->format('Y-m-d H:i:s'),
        ];
    }
}
