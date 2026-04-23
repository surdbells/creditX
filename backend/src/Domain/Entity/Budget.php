<?php
declare(strict_types=1);
namespace App\Domain\Entity;

use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

/**
 * Budget — a monthly target amount for a specific GL account.
 *
 * Budget amounts are set ahead of the period (e.g. at year-start
 * budgeting). The Budget vs Actual report then compares the budgeted
 * amount against actual posted activity for the month.
 *
 * Simple model: one row per (gl_id, year, month) combination. The
 * amount represents the budgeted target:
 *   - For income accounts: the revenue target
 *   - For expense accounts: the spending cap
 *
 * Variance is computed in the report, not stored — keeps the model
 * dumb and the calc dynamic with late journal corrections.
 */
#[ORM\Entity]
#[ORM\Table(name: 'budgets')]
#[ORM\UniqueConstraint(name: 'uq_budget_gl_year_month', columns: ['gl_id', 'year', 'month'])]
#[ORM\Index(name: 'idx_budget_year_month', columns: ['year', 'month'])]
#[ORM\HasLifecycleCallbacks]
class Budget
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\ManyToOne(targetEntity: GeneralLedger::class)]
    #[ORM\JoinColumn(name: 'gl_id', referencedColumnName: 'id', nullable: false)]
    private GeneralLedger $generalLedger;

    #[ORM\Column(type: 'string', length: 4)]
    private string $year;

    #[ORM\Column(type: 'string', length: 2)]
    private string $month;

    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)]
    private string $amount = '0.00';

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $notes = null;

    #[ORM\Column(type: 'string', length: 36, nullable: true)]
    private ?string $createdBy = null;

    public function __construct() { $this->id = Uuid::uuid4()->toString(); }

    public function getId(): string { return $this->id; }
    public function getGeneralLedger(): GeneralLedger { return $this->generalLedger; }
    public function setGeneralLedger(GeneralLedger $v): void { $this->generalLedger = $v; }
    public function getYear(): string { return $this->year; }
    public function setYear(string $v): void { $this->year = $v; }
    public function getMonth(): string { return $this->month; }
    public function setMonth(string $v): void { $this->month = str_pad($v, 2, '0', STR_PAD_LEFT); }
    public function getAmount(): string { return $this->amount; }
    public function setAmount(string $v): void { $this->amount = $v; }
    public function getNotes(): ?string { return $this->notes; }
    public function setNotes(?string $v): void { $this->notes = $v; }
    public function getCreatedBy(): ?string { return $this->createdBy; }
    public function setCreatedBy(?string $v): void { $this->createdBy = $v; }

    public function getLabel(): string { return "{$this->year}-{$this->month}"; }

    public function toArray(): array
    {
        return [
            'id'         => $this->id,
            'gl_id'      => $this->generalLedger->getId(),
            'gl_code'    => $this->generalLedger->getAccountCode(),
            'gl_name'    => $this->generalLedger->getAccountName(),
            'gl_type'    => $this->generalLedger->getAccountType()->value,
            'year'       => $this->year,
            'month'      => $this->month,
            'label'      => $this->getLabel(),
            'amount'     => $this->amount,
            'notes'      => $this->notes,
            'created_by' => $this->createdBy,
            'created_at' => $this->createdAt->format('Y-m-d H:i:s'),
        ];
    }
}
