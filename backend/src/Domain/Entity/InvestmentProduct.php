<?php

declare(strict_types=1);

namespace App\Domain\Entity;

use App\Domain\Enum\InvestmentPayoutFrequency;
use App\Domain\Enum\InvestmentPayoutMode;
use App\Domain\Enum\InvestmentType;
use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

/**
 * An investment product — the template an investor's Investment is placed
 * against. Sibling to DepositProduct/LoanProduct: it holds the configurable
 * rules every investment of this product inherits (and snapshots at placement,
 * so later product edits never change a live investment's terms).
 *
 * Two shapes, per InvestmentType:
 *   FIXED_TERM  — tenor bounded by min/maxTenorDays, a maturity date, and an
 *                 early-liquidation penalty. Payout follows payoutMode.
 *   OPEN_ENDED  — no tenor/maturity; top-ups allowed; always compounded on the
 *                 running balance at payoutFrequency.
 */
#[ORM\Entity]
#[ORM\Table(name: 'investment_products')]
#[ORM\UniqueConstraint(name: 'uniq_investment_products_code', columns: ['code'])]
#[ORM\HasLifecycleCallbacks]
class InvestmentProduct
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

    #[ORM\Column(type: 'string', length: 20, enumType: InvestmentType::class)]
    private InvestmentType $type = InvestmentType::FIXED_TERM;

    /** Annual interest rate as a decimal (e.g. 0.120000 = 12% p.a.). */
    #[ORM\Column(name: 'interest_rate', type: 'decimal', precision: 8, scale: 6)]
    private string $interestRate = '0.000000';

    #[ORM\Column(name: 'payout_mode', type: 'string', length: 20, enumType: InvestmentPayoutMode::class)]
    private InvestmentPayoutMode $payoutMode = InvestmentPayoutMode::AT_MATURITY;

    /** Compounding / payout cadence for PERIODIC and COMPOUNDED modes. */
    #[ORM\Column(name: 'payout_frequency', type: 'string', length: 20, enumType: InvestmentPayoutFrequency::class)]
    private InvestmentPayoutFrequency $payoutFrequency = InvestmentPayoutFrequency::MONTHLY;

    /** Fixed-term tenor bounds (days). Null for open-ended. */
    #[ORM\Column(name: 'min_tenor_days', type: 'integer', nullable: true)]
    private ?int $minTenorDays = null;

    #[ORM\Column(name: 'max_tenor_days', type: 'integer', nullable: true)]
    private ?int $maxTenorDays = null;

    /** Minimum amount to place an investment of this product. */
    #[ORM\Column(name: 'min_amount', type: 'decimal', precision: 15, scale: 2)]
    private string $minAmount = '0.00';

    /** Whether the investor may add to an active investment (open-ended). */
    #[ORM\Column(name: 'top_up_allowed', type: 'boolean', options: ['default' => false])]
    private bool $topUpAllowed = false;

    /**
     * Penalty applied to accrued interest on early liquidation of a fixed-term
     * investment, as a decimal (e.g. 0.250000 = forfeit 25% of interest, or
     * with penaltyOnPrincipal a charge on principal). 0 = no penalty.
     */
    #[ORM\Column(name: 'early_liquidation_penalty_rate', type: 'decimal', precision: 8, scale: 6)]
    private string $earlyLiquidationPenaltyRate = '0.000000';

    /** Withholding tax rate on interest (Nigeria: 0.100000 = 10%). */
    #[ORM\Column(name: 'wht_rate', type: 'decimal', precision: 8, scale: 6)]
    private string $whtRate = '0.100000';

    /** Day-count denominator for interest (365 or 360). */
    #[ORM\Column(name: 'day_count_basis', type: 'integer', options: ['default' => 365])]
    private int $dayCountBasis = 365;

    /** Default auto-rollover at maturity for fixed-term (investor can override per placement). */
    #[ORM\Column(name: 'auto_rollover', type: 'boolean', options: ['default' => false])]
    private bool $autoRollover = false;

    #[ORM\Column(name: 'is_active', type: 'boolean', options: ['default' => true])]
    private bool $isActive = true;

    public function __construct()
    {
        $this->id = Uuid::uuid4()->toString();
    }

    public function getId(): string { return $this->id; }
    public function getName(): string { return $this->name; }
    public function setName(string $v): void { $this->name = trim($v); }
    public function getCode(): string { return $this->code; }
    public function setCode(string $v): void { $this->code = strtoupper(trim($v)); }
    public function getDescription(): ?string { return $this->description; }
    public function setDescription(?string $v): void { $this->description = $v; }
    public function getType(): InvestmentType { return $this->type; }
    public function setType(InvestmentType $v): void { $this->type = $v; }
    public function getInterestRate(): string { return $this->interestRate; }
    public function setInterestRate(string $v): void { $this->interestRate = $v; }
    public function getPayoutMode(): InvestmentPayoutMode { return $this->payoutMode; }
    public function setPayoutMode(InvestmentPayoutMode $v): void { $this->payoutMode = $v; }
    public function getPayoutFrequency(): InvestmentPayoutFrequency { return $this->payoutFrequency; }
    public function setPayoutFrequency(InvestmentPayoutFrequency $v): void { $this->payoutFrequency = $v; }
    public function getMinTenorDays(): ?int { return $this->minTenorDays; }
    public function setMinTenorDays(?int $v): void { $this->minTenorDays = $v; }
    public function getMaxTenorDays(): ?int { return $this->maxTenorDays; }
    public function setMaxTenorDays(?int $v): void { $this->maxTenorDays = $v; }
    public function getMinAmount(): string { return $this->minAmount; }
    public function setMinAmount(string $v): void { $this->minAmount = $v; }
    public function isTopUpAllowed(): bool { return $this->topUpAllowed; }
    public function setTopUpAllowed(bool $v): void { $this->topUpAllowed = $v; }
    public function getEarlyLiquidationPenaltyRate(): string { return $this->earlyLiquidationPenaltyRate; }
    public function setEarlyLiquidationPenaltyRate(string $v): void { $this->earlyLiquidationPenaltyRate = $v; }
    public function getWhtRate(): string { return $this->whtRate; }
    public function setWhtRate(string $v): void { $this->whtRate = $v; }
    public function getDayCountBasis(): int { return $this->dayCountBasis; }
    public function setDayCountBasis(int $v): void { $this->dayCountBasis = $v === 360 ? 360 : 365; }
    public function isAutoRollover(): bool { return $this->autoRollover; }
    public function setAutoRollover(bool $v): void { $this->autoRollover = $v; }
    public function isActive(): bool { return $this->isActive; }
    public function setIsActive(bool $v): void { $this->isActive = $v; }

    public function toArray(): array
    {
        return [
            'id'                             => $this->id,
            'name'                           => $this->name,
            'code'                           => $this->code,
            'description'                    => $this->description,
            'type'                           => $this->type->value,
            'interest_rate'                  => $this->interestRate,
            'payout_mode'                    => $this->payoutMode->value,
            'payout_frequency'               => $this->payoutFrequency->value,
            'min_tenor_days'                 => $this->minTenorDays,
            'max_tenor_days'                 => $this->maxTenorDays,
            'min_amount'                     => $this->minAmount,
            'top_up_allowed'                 => $this->topUpAllowed,
            'early_liquidation_penalty_rate' => $this->earlyLiquidationPenaltyRate,
            'wht_rate'                       => $this->whtRate,
            'day_count_basis'                => $this->dayCountBasis,
            'auto_rollover'                  => $this->autoRollover,
            'is_active'                      => $this->isActive,
            'created_at'                     => $this->createdAt->format('Y-m-d H:i:s'),
            'updated_at'                     => $this->updatedAt->format('Y-m-d H:i:s'),
        ];
    }
}
