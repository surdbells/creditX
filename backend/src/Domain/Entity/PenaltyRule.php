<?php
declare(strict_types=1);
namespace App\Domain\Entity;

use App\Domain\Enum\PenaltyCalculationType;
use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

#[ORM\Entity(repositoryClass: \App\Domain\Repository\PenaltyRuleRepository::class)]
#[ORM\Table(name: 'penalty_rules')]
#[ORM\HasLifecycleCallbacks]
class PenaltyRule
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\ManyToOne(targetEntity: LoanProduct::class)]
    #[ORM\JoinColumn(name: 'product_id', referencedColumnName: 'id', nullable: false)]
    private LoanProduct $product;

    #[ORM\Column(type: 'string', length: 100)]
    private string $name;

    #[ORM\Column(type: 'integer', options: ['default' => 0])]
    private int $gracePeriodDays = 0;

    #[ORM\Column(type: 'string', length: 20, enumType: PenaltyCalculationType::class)]
    private PenaltyCalculationType $calculationType;

    /** Flat amount or percentage decimal */
    #[ORM\Column(type: 'decimal', precision: 15, scale: 6)]
    private string $value = '0.000000';

    /** Maximum penalty amount cap (null = no cap) */
    #[ORM\Column(type: 'decimal', precision: 15, scale: 2, nullable: true)]
    private ?string $maxAmount = null;

    #[ORM\Column(type: 'boolean', options: ['default' => false])]
    private bool $isCompounding = false;

    #[ORM\Column(type: 'boolean', options: ['default' => true])]
    private bool $isActive = true;

    public function __construct() { $this->id = Uuid::uuid4()->toString(); }

    public function getId(): string { return $this->id; }
    public function getProduct(): LoanProduct { return $this->product; }
    public function setProduct(LoanProduct $v): void { $this->product = $v; }
    public function getName(): string { return $this->name; }
    public function setName(string $v): void { $this->name = trim($v); }
    public function getGracePeriodDays(): int { return $this->gracePeriodDays; }
    public function setGracePeriodDays(int $v): void { $this->gracePeriodDays = max(0, $v); }
    public function getCalculationType(): PenaltyCalculationType { return $this->calculationType; }
    public function setCalculationType(PenaltyCalculationType $v): void { $this->calculationType = $v; }
    public function getValue(): string { return $this->value; }
    public function setValue(string $v): void { $this->value = $v; }
    public function getMaxAmount(): ?string { return $this->maxAmount; }
    public function setMaxAmount(?string $v): void { $this->maxAmount = $v; }
    public function isCompounding(): bool { return $this->isCompounding; }
    public function setIsCompounding(bool $v): void { $this->isCompounding = $v; }
    public function isActive(): bool { return $this->isActive; }
    public function setIsActive(bool $v): void { $this->isActive = $v; }

    /**
     * Calculate penalty for a given overdue amount.
     */
    public function calculatePenalty(string $overdueAmount): string
    {
        if ($this->calculationType === PenaltyCalculationType::FLAT) {
            $penalty = $this->value;
        } else {
            $penalty = (string) ceil((float) bcmul($overdueAmount, $this->value, 6));
        }

        if ($this->maxAmount !== null && bccomp($penalty, $this->maxAmount, 2) > 0) {
            $penalty = $this->maxAmount;
        }

        return $penalty;
    }

    public function toArray(): array
    {
        return [
            'id' => $this->id, 'product_id' => $this->product->getId(),
            'product_name' => $this->product->getName(),
            'name' => $this->name, 'grace_period_days' => $this->gracePeriodDays,
            'calculation_type' => $this->calculationType->value, 'value' => $this->value,
            'max_amount' => $this->maxAmount, 'is_compounding' => $this->isCompounding,
            'is_active' => $this->isActive, 'created_at' => $this->createdAt->format('Y-m-d H:i:s'),
        ];
    }
}
