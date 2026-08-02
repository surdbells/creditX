<?php

declare(strict_types=1);

namespace App\Domain\Entity;

use App\Domain\Enum\InterestMethod;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

#[ORM\Entity]
#[ORM\Table(name: 'loan_products')]
#[ORM\UniqueConstraint(name: 'uniq_loan_products_code', columns: ['code'])]
#[ORM\HasLifecycleCallbacks]
class LoanProduct
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\Column(type: 'string', length: 150)]
    private string $name;

    #[ORM\Column(type: 'string', length: 30, unique: true)]
    private string $code;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $description = null;

    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)]
    private string $minAmount = '0.00';

    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)]
    private string $maxAmount = '0.00';

    #[ORM\Column(type: 'integer')]
    private int $minTenure = 1;

    #[ORM\Column(type: 'integer')]
    private int $maxTenure = 12;

    #[ORM\Column(type: 'string', length: 30, enumType: InterestMethod::class)]
    private InterestMethod $interestCalculationMethod = InterestMethod::FLAT_RATE;

    /** Monthly interest rate as decimal (e.g., 0.05 = 5%) */
    #[ORM\Column(type: 'decimal', precision: 8, scale: 6)]
    private string $interestRate = '0.050000';

    #[ORM\Column(type: 'integer', nullable: true)]
    private ?int $maxCustomerAge = null;

    #[ORM\Column(type: 'integer', nullable: true)]
    private ?int $maxServiceYears = null;

    #[ORM\Column(type: 'boolean', options: ['default' => true])]
    private bool $allowsTopUp = true;

    #[ORM\Column(type: 'boolean', options: ['default' => true])]
    private bool $isActive = true;

    /**
     * Which channels may ORIGINATE a loan against this product.
     *
     * All default true so nothing disappears when the feature ships — a
     * product is offered everywhere until someone narrows it. These gate the
     * origination product lists only; admin product management always shows
     * every product regardless, or a product switched off everywhere would
     * become uneditable.
     *
     * isActive still trumps all three: an inactive product is offered nowhere.
     */
    #[ORM\Column(name: 'available_agent_app', type: 'boolean', options: ['default' => true])]
    private bool $availableAgentApp = true;

    #[ORM\Column(name: 'available_portal', type: 'boolean', options: ['default' => true])]
    private bool $availablePortal = true;

    #[ORM\Column(name: 'available_back_office', type: 'boolean', options: ['default' => true])]
    private bool $availableBackOffice = true;

    /** @var Collection<int, ProductFee> */
    #[ORM\OneToMany(targetEntity: ProductFee::class, mappedBy: 'product', cascade: ['persist', 'remove'], orphanRemoval: true)]
    private Collection $fees;

    public function __construct()
    {
        $this->id = Uuid::uuid4()->toString();
        $this->fees = new ArrayCollection();
    }

    // ─── Getters ───
    public function getId(): string { return $this->id; }
    public function getName(): string { return $this->name; }
    public function getCode(): string { return $this->code; }
    public function getDescription(): ?string { return $this->description; }
    public function getMinAmount(): string { return $this->minAmount; }
    public function getMaxAmount(): string { return $this->maxAmount; }
    public function getMinTenure(): int { return $this->minTenure; }
    public function getMaxTenure(): int { return $this->maxTenure; }
    public function getInterestCalculationMethod(): InterestMethod { return $this->interestCalculationMethod; }
    public function getInterestRate(): string { return $this->interestRate; }
    public function getMaxCustomerAge(): ?int { return $this->maxCustomerAge; }
    public function getMaxServiceYears(): ?int { return $this->maxServiceYears; }
    public function allowsTopUp(): bool { return $this->allowsTopUp; }
    public function isActive(): bool { return $this->isActive; }
    public function isAvailableAgentApp(): bool { return $this->availableAgentApp; }
    public function isAvailablePortal(): bool { return $this->availablePortal; }
    public function isAvailableBackOffice(): bool { return $this->availableBackOffice; }

    /** Is this product offerable on a given channel right now? */
    public function isAvailableOn(string $channel): bool
    {
        if (!$this->isActive) return false;
        return match ($channel) {
            'agent_app'   => $this->availableAgentApp,
            'portal'      => $this->availablePortal,
            'back_office' => $this->availableBackOffice,
            default       => true,
        };
    }
    /** @return Collection<int, ProductFee> */
    public function getFees(): Collection { return $this->fees; }

    // ─── Setters ───
    public function setName(string $v): void { $this->name = trim($v); }
    public function setCode(string $v): void { $this->code = strtoupper(trim($v)); }
    public function setDescription(?string $v): void { $this->description = $v; }
    public function setMinAmount(string $v): void { $this->minAmount = $v; }
    public function setMaxAmount(string $v): void { $this->maxAmount = $v; }
    public function setMinTenure(int $v): void { $this->minTenure = max(1, $v); }
    public function setMaxTenure(int $v): void { $this->maxTenure = max(1, $v); }
    public function setInterestCalculationMethod(InterestMethod $v): void { $this->interestCalculationMethod = $v; }
    public function setInterestRate(string $v): void { $this->interestRate = $v; }
    public function setMaxCustomerAge(?int $v): void { $this->maxCustomerAge = $v; }
    public function setMaxServiceYears(?int $v): void { $this->maxServiceYears = $v; }
    public function setAllowsTopUp(bool $v): void { $this->allowsTopUp = $v; }
    public function setIsActive(bool $v): void { $this->isActive = $v; }
    public function setAvailableAgentApp(bool $v): void { $this->availableAgentApp = $v; }
    public function setAvailablePortal(bool $v): void { $this->availablePortal = $v; }
    public function setAvailableBackOffice(bool $v): void { $this->availableBackOffice = $v; }

    public function addFee(ProductFee $fee): void
    {
        if (!$this->fees->contains($fee)) {
            $fee->setProduct($this);
            $this->fees->add($fee);
        }
    }

    public function removeFee(ProductFee $fee): void
    {
        $this->fees->removeElement($fee);
    }

    public function clearFees(): void
    {
        $this->fees->clear();
    }

    public function toArray(bool $includeFees = false): array
    {
        $data = [
            'id'                          => $this->id,
            'name'                        => $this->name,
            'code'                        => $this->code,
            'description'                 => $this->description,
            'min_amount'                  => $this->minAmount,
            'max_amount'                  => $this->maxAmount,
            'min_tenure'                  => $this->minTenure,
            'max_tenure'                  => $this->maxTenure,
            'interest_calculation_method' => $this->interestCalculationMethod->value,
            'interest_rate'               => $this->interestRate,
            'max_customer_age'            => $this->maxCustomerAge,
            'max_service_years'           => $this->maxServiceYears,
            'allows_top_up'               => $this->allowsTopUp,
            'is_active'                   => $this->isActive,
            'available_agent_app'         => $this->availableAgentApp,
            'available_portal'            => $this->availablePortal,
            'available_back_office'       => $this->availableBackOffice,
            'created_at'                  => $this->createdAt->format('Y-m-d H:i:s'),
            'updated_at'                  => $this->updatedAt->format('Y-m-d H:i:s'),
        ];

        if ($includeFees) {
            $data['fees'] = $this->fees->map(fn(ProductFee $f) => $f->toArray())->toArray();
        }

        return $data;
    }
}
