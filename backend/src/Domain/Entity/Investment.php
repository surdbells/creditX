<?php

declare(strict_types=1);

namespace App\Domain\Entity;

use App\Domain\Enum\InvestmentPayoutFrequency;
use App\Domain\Enum\InvestmentPayoutMode;
use App\Domain\Enum\InvestmentStatus;
use App\Domain\Enum\InvestmentType;
use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

/**
 * A customer's investment — the subsidiary ledger behind the Investment
 * Liability GL control account. Placed against one InvestmentProduct, whose
 * terms are SNAPSHOTTED here at placement (rate, tenor, payout, WHT, day-count)
 * so a later product edit can never change a live investment's economics.
 *
 * Money fields, all decimal(15,2):
 *   principal            — original amount placed.
 *   balance              — current principal balance. Grows with top-ups and
 *                          capitalised interest (compounded), shrinks with
 *                          withdrawals. This is what interest accrues on.
 *   accruedInterest      — interest recognised but not yet paid or capitalised.
 *   interestEarnedToDate — cumulative GROSS interest recognised over the life.
 *   interestPaidToDate   — cumulative NET interest actually paid to the investor.
 *   whtWithheldToDate    — cumulative withholding tax deducted.
 *
 * The authoritative principal is still the Investment Liability GL / the sum of
 * this investment's transaction legs; balance is denormalised for fast reads
 * and is kept in step inside each posting transaction.
 */
#[ORM\Entity]
#[ORM\Table(name: 'investments')]
#[ORM\UniqueConstraint(name: 'uniq_investments_number', columns: ['investment_number'])]
#[ORM\Index(name: 'idx_investments_customer', columns: ['customer_id'])]
#[ORM\Index(name: 'idx_investments_product', columns: ['product_id'])]
#[ORM\Index(name: 'idx_investments_status', columns: ['status'])]
#[ORM\Index(name: 'idx_investments_maturity', columns: ['maturity_date'])]
#[ORM\HasLifecycleCallbacks]
class Investment
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\Column(name: 'investment_number', type: 'string', length: 24, unique: true)]
    private string $investmentNumber;

    #[ORM\ManyToOne(targetEntity: Customer::class)]
    #[ORM\JoinColumn(name: 'customer_id', referencedColumnName: 'id', nullable: false)]
    private Customer $customer;

    #[ORM\ManyToOne(targetEntity: InvestmentProduct::class)]
    #[ORM\JoinColumn(name: 'product_id', referencedColumnName: 'id', nullable: false)]
    private InvestmentProduct $product;

    // ── Snapshotted terms (frozen at placement) ──────────────────────────────
    #[ORM\Column(type: 'string', length: 20, enumType: InvestmentType::class)]
    private InvestmentType $type;

    #[ORM\Column(name: 'interest_rate', type: 'decimal', precision: 8, scale: 6)]
    private string $interestRate = '0.000000';

    #[ORM\Column(name: 'payout_mode', type: 'string', length: 20, enumType: InvestmentPayoutMode::class)]
    private InvestmentPayoutMode $payoutMode;

    #[ORM\Column(name: 'payout_frequency', type: 'string', length: 20, enumType: InvestmentPayoutFrequency::class)]
    private InvestmentPayoutFrequency $payoutFrequency;

    #[ORM\Column(name: 'tenor_days', type: 'integer', nullable: true)]
    private ?int $tenorDays = null;

    #[ORM\Column(name: 'wht_rate', type: 'decimal', precision: 8, scale: 6)]
    private string $whtRate = '0.100000';

    #[ORM\Column(name: 'early_liquidation_penalty_rate', type: 'decimal', precision: 8, scale: 6)]
    private string $earlyLiquidationPenaltyRate = '0.000000';

    #[ORM\Column(name: 'day_count_basis', type: 'integer', options: ['default' => 365])]
    private int $dayCountBasis = 365;

    #[ORM\Column(name: 'auto_rollover', type: 'boolean', options: ['default' => false])]
    private bool $autoRollover = false;

    // ── Money ────────────────────────────────────────────────────────────────
    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)]
    private string $principal = '0.00';

    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)]
    private string $balance = '0.00';

    #[ORM\Column(name: 'accrued_interest', type: 'decimal', precision: 15, scale: 2)]
    private string $accruedInterest = '0.00';

    #[ORM\Column(name: 'interest_earned_to_date', type: 'decimal', precision: 15, scale: 2)]
    private string $interestEarnedToDate = '0.00';

    #[ORM\Column(name: 'interest_paid_to_date', type: 'decimal', precision: 15, scale: 2)]
    private string $interestPaidToDate = '0.00';

    #[ORM\Column(name: 'wht_withheld_to_date', type: 'decimal', precision: 15, scale: 2)]
    private string $whtWithheldToDate = '0.00';

    // ── Lifecycle ──────────────────────────────────────────────────────────
    #[ORM\Column(type: 'string', length: 20, enumType: InvestmentStatus::class)]
    private InvestmentStatus $status = InvestmentStatus::ACTIVE;

    #[ORM\Column(name: 'placement_date', type: 'date_immutable')]
    private \DateTimeImmutable $placementDate;

    /** Null for open-ended. */
    #[ORM\Column(name: 'maturity_date', type: 'date_immutable', nullable: true)]
    private ?\DateTimeImmutable $maturityDate = null;

    /** Last date interest was accrued through — drives the next accrual window. */
    #[ORM\Column(name: 'last_accrual_date', type: 'date_immutable', nullable: true)]
    private ?\DateTimeImmutable $lastAccrualDate = null;

    /** Next scheduled payout/compounding date (periodic/compounded). */
    #[ORM\Column(name: 'next_payout_date', type: 'date_immutable', nullable: true)]
    private ?\DateTimeImmutable $nextPayoutDate = null;

    #[ORM\Column(name: 'closed_date', type: 'date_immutable', nullable: true)]
    private ?\DateTimeImmutable $closedDate = null;

    /**
     * Optional deposit account interest payouts are credited to. When null,
     * payouts settle to the operator-chosen bank GL at payout time.
     */
    #[ORM\Column(name: 'payout_deposit_account_id', type: 'string', length: 36, nullable: true)]
    private ?string $payoutDepositAccountId = null;

    /** When this investment is a rollover of a matured one, the prior id (audit chain). */
    #[ORM\Column(name: 'rolled_from_id', type: 'string', length: 36, nullable: true)]
    private ?string $rolledFromId = null;

    public function __construct()
    {
        $this->id = Uuid::uuid4()->toString();
        $this->placementDate = new \DateTimeImmutable('today');
    }

    public function getId(): string { return $this->id; }
    public function getInvestmentNumber(): string { return $this->investmentNumber; }
    public function setInvestmentNumber(string $v): void { $this->investmentNumber = $v; }
    public function getCustomer(): Customer { return $this->customer; }
    public function setCustomer(Customer $v): void { $this->customer = $v; }
    public function getProduct(): InvestmentProduct { return $this->product; }
    public function setProduct(InvestmentProduct $v): void { $this->product = $v; }

    public function getType(): InvestmentType { return $this->type; }
    public function setType(InvestmentType $v): void { $this->type = $v; }
    public function getInterestRate(): string { return $this->interestRate; }
    public function setInterestRate(string $v): void { $this->interestRate = $v; }
    public function getPayoutMode(): InvestmentPayoutMode { return $this->payoutMode; }
    public function setPayoutMode(InvestmentPayoutMode $v): void { $this->payoutMode = $v; }
    public function getPayoutFrequency(): InvestmentPayoutFrequency { return $this->payoutFrequency; }
    public function setPayoutFrequency(InvestmentPayoutFrequency $v): void { $this->payoutFrequency = $v; }
    public function getTenorDays(): ?int { return $this->tenorDays; }
    public function setTenorDays(?int $v): void { $this->tenorDays = $v; }
    public function getWhtRate(): string { return $this->whtRate; }
    public function setWhtRate(string $v): void { $this->whtRate = $v; }
    public function getEarlyLiquidationPenaltyRate(): string { return $this->earlyLiquidationPenaltyRate; }
    public function setEarlyLiquidationPenaltyRate(string $v): void { $this->earlyLiquidationPenaltyRate = $v; }
    public function getDayCountBasis(): int { return $this->dayCountBasis; }
    public function setDayCountBasis(int $v): void { $this->dayCountBasis = $v === 360 ? 360 : 365; }
    public function isAutoRollover(): bool { return $this->autoRollover; }
    public function setAutoRollover(bool $v): void { $this->autoRollover = $v; }

    public function getPrincipal(): string { return $this->principal; }
    public function setPrincipal(string $v): void { $this->principal = $v; }
    public function getBalance(): string { return $this->balance; }
    public function setBalance(string $v): void { $this->balance = $v; }
    public function getAccruedInterest(): string { return $this->accruedInterest; }
    public function setAccruedInterest(string $v): void { $this->accruedInterest = $v; }
    public function getInterestEarnedToDate(): string { return $this->interestEarnedToDate; }
    public function setInterestEarnedToDate(string $v): void { $this->interestEarnedToDate = $v; }
    public function getInterestPaidToDate(): string { return $this->interestPaidToDate; }
    public function setInterestPaidToDate(string $v): void { $this->interestPaidToDate = $v; }
    public function getWhtWithheldToDate(): string { return $this->whtWithheldToDate; }
    public function setWhtWithheldToDate(string $v): void { $this->whtWithheldToDate = $v; }

    public function getStatus(): InvestmentStatus { return $this->status; }
    public function setStatus(InvestmentStatus $v): void { $this->status = $v; }
    public function getPlacementDate(): \DateTimeImmutable { return $this->placementDate; }
    public function setPlacementDate(\DateTimeImmutable $v): void { $this->placementDate = $v; }
    public function getMaturityDate(): ?\DateTimeImmutable { return $this->maturityDate; }
    public function setMaturityDate(?\DateTimeImmutable $v): void { $this->maturityDate = $v; }
    public function getLastAccrualDate(): ?\DateTimeImmutable { return $this->lastAccrualDate; }
    public function setLastAccrualDate(?\DateTimeImmutable $v): void { $this->lastAccrualDate = $v; }
    public function getNextPayoutDate(): ?\DateTimeImmutable { return $this->nextPayoutDate; }
    public function setNextPayoutDate(?\DateTimeImmutable $v): void { $this->nextPayoutDate = $v; }
    public function getClosedDate(): ?\DateTimeImmutable { return $this->closedDate; }
    public function setClosedDate(?\DateTimeImmutable $v): void { $this->closedDate = $v; }
    public function getPayoutDepositAccountId(): ?string { return $this->payoutDepositAccountId; }
    public function setPayoutDepositAccountId(?string $v): void { $this->payoutDepositAccountId = $v; }
    public function getRolledFromId(): ?string { return $this->rolledFromId; }
    public function setRolledFromId(?string $v): void { $this->rolledFromId = $v; }

    public function isActive(): bool { return $this->status === InvestmentStatus::ACTIVE; }
    public function isFixedTerm(): bool { return $this->type === InvestmentType::FIXED_TERM; }

    public static function generateNumber(): string
    {
        return 'INV' . str_pad((string) random_int(1, 999999999), 9, '0', STR_PAD_LEFT);
    }

    /** Current investor position: balance + interest accrued but not yet settled. */
    public function currentValue(): string
    {
        return bcadd($this->balance, $this->accruedInterest, 2);
    }

    public function toArray(): array
    {
        return [
            'id'                             => $this->id,
            'investment_number'             => $this->investmentNumber,
            'customer_id'                    => $this->customer->getId(),
            'customer_name'                  => $this->customer->getFullName(),
            'product_id'                     => $this->product->getId(),
            'product_name'                   => $this->product->getName(),
            'product_code'                   => $this->product->getCode(),
            'type'                           => $this->type->value,
            'interest_rate'                  => $this->interestRate,
            'payout_mode'                    => $this->payoutMode->value,
            'payout_frequency'               => $this->payoutFrequency->value,
            'tenor_days'                     => $this->tenorDays,
            'wht_rate'                       => $this->whtRate,
            'early_liquidation_penalty_rate' => $this->earlyLiquidationPenaltyRate,
            'day_count_basis'                => $this->dayCountBasis,
            'auto_rollover'                  => $this->autoRollover,
            'principal'                      => $this->principal,
            'balance'                        => $this->balance,
            'accrued_interest'               => $this->accruedInterest,
            'interest_earned_to_date'        => $this->interestEarnedToDate,
            'interest_paid_to_date'          => $this->interestPaidToDate,
            'wht_withheld_to_date'           => $this->whtWithheldToDate,
            'current_value'                  => $this->currentValue(),
            'status'                         => $this->status->value,
            'placement_date'                 => $this->placementDate->format('Y-m-d'),
            'maturity_date'                  => $this->maturityDate?->format('Y-m-d'),
            'last_accrual_date'              => $this->lastAccrualDate?->format('Y-m-d'),
            'next_payout_date'               => $this->nextPayoutDate?->format('Y-m-d'),
            'closed_date'                    => $this->closedDate?->format('Y-m-d'),
            'payout_deposit_account_id'      => $this->payoutDepositAccountId,
            'rolled_from_id'                 => $this->rolledFromId,
            'created_at'                     => $this->createdAt->format('Y-m-d H:i:s'),
            'updated_at'                     => $this->updatedAt->format('Y-m-d H:i:s'),
        ];
    }
}
