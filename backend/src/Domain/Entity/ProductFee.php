<?php

declare(strict_types=1);

namespace App\Domain\Entity;

use App\Domain\Enum\FeeAppliesTo;
use App\Domain\Enum\FeeCalculationType;
use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

#[ORM\Entity]
#[ORM\Table(name: 'product_fees')]
#[ORM\HasLifecycleCallbacks]
class ProductFee
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\ManyToOne(targetEntity: LoanProduct::class, inversedBy: 'fees')]
    #[ORM\JoinColumn(name: 'product_id', referencedColumnName: 'id', nullable: false)]
    private LoanProduct $product;

    #[ORM\ManyToOne(targetEntity: FeeType::class)]
    #[ORM\JoinColumn(name: 'fee_type_id', referencedColumnName: 'id', nullable: false)]
    private FeeType $feeType;

    #[ORM\Column(type: 'string', length: 20, enumType: FeeCalculationType::class)]
    private FeeCalculationType $calculationType = FeeCalculationType::FLAT;

    /** Flat amount or percentage decimal (e.g., 0.02 = 2%) */
    #[ORM\Column(type: 'decimal', precision: 15, scale: 6)]
    private string $value = '0.000000';

    /** Whether fee is deducted from disbursement amount */
    #[ORM\Column(type: 'boolean', options: ['default' => true])]
    private bool $isDeductedAtSource = true;

    /** Base for percentage calculation */
    #[ORM\Column(type: 'string', length: 20, enumType: FeeAppliesTo::class)]
    private FeeAppliesTo $appliesTo = FeeAppliesTo::PRINCIPAL;

    #[ORM\Column(type: 'boolean', options: ['default' => true])]
    private bool $isActive = true;

    public function __construct()
    {
        $this->id = Uuid::uuid4()->toString();
    }

    public function getId(): string { return $this->id; }
    public function getProduct(): LoanProduct { return $this->product; }
    public function setProduct(LoanProduct $v): void { $this->product = $v; }
    public function getFeeType(): FeeType { return $this->feeType; }
    public function setFeeType(FeeType $v): void { $this->feeType = $v; }
    public function getCalculationType(): FeeCalculationType { return $this->calculationType; }
    public function setCalculationType(FeeCalculationType $v): void { $this->calculationType = $v; }
    public function getValue(): string { return $this->value; }
    public function setValue(string $v): void { $this->value = $v; }
    public function isDeductedAtSource(): bool { return $this->isDeductedAtSource; }
    public function setIsDeductedAtSource(bool $v): void { $this->isDeductedAtSource = $v; }
    public function getAppliesTo(): FeeAppliesTo { return $this->appliesTo; }
    public function setAppliesTo(FeeAppliesTo $v): void { $this->appliesTo = $v; }
    public function isActive(): bool { return $this->isActive; }
    public function setIsActive(bool $v): void { $this->isActive = $v; }

    /**
     * Compute the fee amount for a given loan.
     */
    public function computeAmount(string $principal, string $grossLoan): string
    {
        $base = $this->appliesTo === FeeAppliesTo::GROSS_LOAN ? $grossLoan : $principal;

        if ($this->calculationType === FeeCalculationType::FLAT) {
            return $this->value;
        }

        // Percentage
        $amount = bcmul($base, $this->value, 2);
        return (string) ceil((float) $amount); // Ceiling to match existing behavior
    }

    public function toArray(): array
    {
        return [
            'id'                   => $this->id,
            'product_id'           => $this->product->getId(),
            'fee_type_id'          => $this->feeType->getId(),
            'fee_type_name'        => $this->feeType->getName(),
            'fee_type_code'        => $this->feeType->getCode(),
            'calculation_type'     => $this->calculationType->value,
            'value'                => $this->value,
            'is_deducted_at_source' => $this->isDeductedAtSource,
            'applies_to'           => $this->appliesTo->value,
            'is_active'            => $this->isActive,
            'created_at'           => $this->createdAt->format('Y-m-d H:i:s'),
        ];
    }
}
