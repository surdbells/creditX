<?php
declare(strict_types=1);
namespace App\Domain\Entity;

use App\Domain\Enum\ReconciliationMatchType;
use App\Domain\Enum\ReconciliationStatus;
use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

#[ORM\Entity]
#[ORM\Table(name: 'reconciliation_items')]
#[ORM\HasLifecycleCallbacks]
class ReconciliationItem
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\ManyToOne(targetEntity: Reconciliation::class, inversedBy: 'items')]
    #[ORM\JoinColumn(name: 'reconciliation_id', referencedColumnName: 'id', nullable: false)]
    private Reconciliation $reconciliation;

    #[ORM\Column(type: 'string', length: 100, nullable: true)]
    private ?string $bankReference = null;

    #[ORM\Column(type: 'decimal', precision: 15, scale: 2, nullable: true)]
    private ?string $bankAmount = null;

    #[ORM\Column(type: 'string', length: 100, nullable: true)]
    private ?string $systemReference = null;

    #[ORM\Column(type: 'decimal', precision: 15, scale: 2, nullable: true)]
    private ?string $systemAmount = null;

    #[ORM\Column(type: 'string', length: 30, enumType: ReconciliationStatus::class)]
    private ReconciliationStatus $status = ReconciliationStatus::PENDING;

    #[ORM\Column(type: 'string', length: 30, enumType: ReconciliationMatchType::class)]
    private ReconciliationMatchType $matchType = ReconciliationMatchType::UNMATCHED_BANK;

    public function __construct() { $this->id = Uuid::uuid4()->toString(); }

    public function getId(): string { return $this->id; }
    public function getReconciliation(): Reconciliation { return $this->reconciliation; }
    public function setReconciliation(Reconciliation $v): void { $this->reconciliation = $v; }
    public function getBankReference(): ?string { return $this->bankReference; }
    public function setBankReference(?string $v): void { $this->bankReference = $v; }
    public function getBankAmount(): ?string { return $this->bankAmount; }
    public function setBankAmount(?string $v): void { $this->bankAmount = $v; }
    public function getSystemReference(): ?string { return $this->systemReference; }
    public function setSystemReference(?string $v): void { $this->systemReference = $v; }
    public function getSystemAmount(): ?string { return $this->systemAmount; }
    public function setSystemAmount(?string $v): void { $this->systemAmount = $v; }
    public function getStatus(): ReconciliationStatus { return $this->status; }
    public function setStatus(ReconciliationStatus $v): void { $this->status = $v; }
    public function getMatchType(): ReconciliationMatchType { return $this->matchType; }
    public function setMatchType(ReconciliationMatchType $v): void { $this->matchType = $v; }

    public function toArray(): array
    {
        return [
            'id' => $this->id, 'bank_reference' => $this->bankReference,
            'bank_amount' => $this->bankAmount, 'system_reference' => $this->systemReference,
            'system_amount' => $this->systemAmount, 'status' => $this->status->value,
            'match_type' => $this->matchType->value,
        ];
    }
}
