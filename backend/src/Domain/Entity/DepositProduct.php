<?php

declare(strict_types=1);

namespace App\Domain\Entity;

use App\Domain\Enum\DepositInterestMethod;
use App\Domain\Enum\DepositWithdrawalPolicy;
use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

/**
 * A deposit product — the template a customer's deposit account is opened
 * against. Mirrors LoanProduct: it holds the configurable rules (interest
 * accrual method + rate, withdrawal policy, balance floors) that every
 * account of this product inherits.
 *
 * The two per-product knobs the business asked for live here:
 *   - interestMethod   (NONE / min-balance-monthly / daily-balance-monthly)
 *   - withdrawalPolicy (strict-min-balance / block-overdraw / allow-overdraw)
 */
#[ORM\Entity]
#[ORM\Table(name: 'deposit_products')]
#[ORM\UniqueConstraint(name: 'uniq_deposit_products_code', columns: ['code'])]
#[ORM\HasLifecycleCallbacks]
class DepositProduct
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

    #[ORM\Column(type: 'string', length: 30, enumType: DepositInterestMethod::class)]
    private DepositInterestMethod $interestMethod = DepositInterestMethod::NONE;

    /** Annual interest rate as a decimal (e.g. 0.040000 = 4% p.a.). Ignored when interestMethod = NONE. */
    #[ORM\Column(type: 'decimal', precision: 8, scale: 6)]
    private string $interestRate = '0.000000';

    #[ORM\Column(type: 'string', length: 30, enumType: DepositWithdrawalPolicy::class)]
    private DepositWithdrawalPolicy $withdrawalPolicy = DepositWithdrawalPolicy::BLOCK_OVERDRAW;

    /** Minimum balance that must remain after a withdrawal under STRICT_MIN_BALANCE. */
    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)]
    private string $minBalance = '0.00';

    /** Minimum amount required to open an account of this product. */
    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)]
    private string $minOpeningBalance = '0.00';

    /** Days of inactivity after which an account is marked DORMANT. */
    #[ORM\Column(type: 'integer')]
    private int $dormancyDays = 180;

    #[ORM\Column(type: 'boolean', options: ['default' => true])]
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
    public function getInterestMethod(): DepositInterestMethod { return $this->interestMethod; }
    public function setInterestMethod(DepositInterestMethod $v): void { $this->interestMethod = $v; }
    public function getInterestRate(): string { return $this->interestRate; }
    public function setInterestRate(string $v): void { $this->interestRate = $v; }
    public function getWithdrawalPolicy(): DepositWithdrawalPolicy { return $this->withdrawalPolicy; }
    public function setWithdrawalPolicy(DepositWithdrawalPolicy $v): void { $this->withdrawalPolicy = $v; }
    public function getMinBalance(): string { return $this->minBalance; }
    public function setMinBalance(string $v): void { $this->minBalance = $v; }
    public function getMinOpeningBalance(): string { return $this->minOpeningBalance; }
    public function setMinOpeningBalance(string $v): void { $this->minOpeningBalance = $v; }
    public function getDormancyDays(): int { return $this->dormancyDays; }
    public function setDormancyDays(int $v): void { $this->dormancyDays = max(0, $v); }
    public function isActive(): bool { return $this->isActive; }
    public function setIsActive(bool $v): void { $this->isActive = $v; }

    public function toArray(): array
    {
        return [
            'id'                  => $this->id,
            'name'                => $this->name,
            'code'                => $this->code,
            'description'         => $this->description,
            'interest_method'     => $this->interestMethod->value,
            'interest_rate'       => $this->interestRate,
            'withdrawal_policy'   => $this->withdrawalPolicy->value,
            'min_balance'         => $this->minBalance,
            'min_opening_balance' => $this->minOpeningBalance,
            'dormancy_days'       => $this->dormancyDays,
            'is_active'           => $this->isActive,
            'created_at'          => $this->createdAt->format('Y-m-d H:i:s'),
            'updated_at'          => $this->updatedAt->format('Y-m-d H:i:s'),
        ];
    }
}
