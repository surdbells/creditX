<?php
declare(strict_types=1);
namespace App\Domain\Entity;

use App\Domain\Enum\ReconciliationStatus;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

#[ORM\Entity(repositoryClass: \App\Domain\Repository\ReconciliationRepository::class)]
#[ORM\Table(name: 'reconciliations')]
#[ORM\HasLifecycleCallbacks]
class Reconciliation
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\Column(type: 'string', length: 4)]
    private string $periodYear;

    #[ORM\Column(type: 'string', length: 2)]
    private string $periodMonth;

    #[ORM\Column(type: 'decimal', precision: 15, scale: 2, options: ['default' => '0.00'])]
    private string $bankTotal = '0.00';

    #[ORM\Column(type: 'decimal', precision: 15, scale: 2, options: ['default' => '0.00'])]
    private string $systemTotal = '0.00';

    #[ORM\Column(type: 'decimal', precision: 15, scale: 2, options: ['default' => '0.00'])]
    private string $difference = '0.00';

    #[ORM\Column(type: 'string', length: 20, enumType: ReconciliationStatus::class)]
    private ReconciliationStatus $status = ReconciliationStatus::PENDING;

    #[ORM\Column(type: 'string', length: 36, nullable: true)]
    private ?string $resolvedBy = null;

    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $resolvedAt = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $notes = null;

    /** @var Collection<int, ReconciliationItem> */
    #[ORM\OneToMany(targetEntity: ReconciliationItem::class, mappedBy: 'reconciliation', cascade: ['persist', 'remove'])]
    private Collection $items;

    public function __construct()
    {
        $this->id = Uuid::uuid4()->toString();
        $this->items = new ArrayCollection();
    }

    public function getId(): string { return $this->id; }
    public function getPeriodYear(): string { return $this->periodYear; }
    public function setPeriodYear(string $v): void { $this->periodYear = $v; }
    public function getPeriodMonth(): string { return $this->periodMonth; }
    public function setPeriodMonth(string $v): void { $this->periodMonth = str_pad($v, 2, '0', STR_PAD_LEFT); }
    public function getBankTotal(): string { return $this->bankTotal; }
    public function setBankTotal(string $v): void { $this->bankTotal = $v; }
    public function getSystemTotal(): string { return $this->systemTotal; }
    public function setSystemTotal(string $v): void { $this->systemTotal = $v; }
    public function getDifference(): string { return $this->difference; }
    public function setDifference(string $v): void { $this->difference = $v; }
    public function getStatus(): ReconciliationStatus { return $this->status; }
    public function setStatus(ReconciliationStatus $v): void { $this->status = $v; }
    public function getResolvedBy(): ?string { return $this->resolvedBy; }
    public function setResolvedBy(?string $v): void { $this->resolvedBy = $v; }
    public function getResolvedAt(): ?\DateTimeImmutable { return $this->resolvedAt; }
    public function getNotes(): ?string { return $this->notes; }
    public function setNotes(?string $v): void { $this->notes = $v; }
    /** @return Collection<int, ReconciliationItem> */
    public function getItems(): Collection { return $this->items; }

    public function addItem(ReconciliationItem $item): void
    {
        $item->setReconciliation($this);
        $this->items->add($item);
    }

    public function resolve(string $userId, ?string $notes = null): void
    {
        $this->status = ReconciliationStatus::RESOLVED;
        $this->resolvedBy = $userId;
        $this->resolvedAt = new \DateTimeImmutable('now', new \DateTimeZone($_ENV['APP_TIMEZONE'] ?? 'Africa/Lagos'));
        $this->notes = $notes;
    }

    public function toArray(bool $includeItems = false): array
    {
        $data = [
            'id' => $this->id, 'period_year' => $this->periodYear, 'period_month' => $this->periodMonth,
            'period' => $this->periodYear . '-' . $this->periodMonth,
            'bank_total' => $this->bankTotal, 'system_total' => $this->systemTotal,
            'difference' => $this->difference, 'status' => $this->status->value,
            'resolved_by' => $this->resolvedBy, 'resolved_at' => $this->resolvedAt?->format('Y-m-d H:i:s'),
            'notes' => $this->notes, 'item_count' => $this->items->count(),
            'created_at' => $this->createdAt->format('Y-m-d H:i:s'),
        ];
        if ($includeItems) {
            $data['items'] = $this->items->map(fn(ReconciliationItem $i) => $i->toArray())->toArray();
        }
        return $data;
    }
}
