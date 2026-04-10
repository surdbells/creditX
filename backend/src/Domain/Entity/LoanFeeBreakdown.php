<?php
declare(strict_types=1);
namespace App\Domain\Entity;

use App\Domain\Enum\FeeCalculationType;
use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

#[ORM\Entity]
#[ORM\Table(name: 'loan_fee_breakdowns')]
#[ORM\HasLifecycleCallbacks]
class LoanFeeBreakdown
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\ManyToOne(targetEntity: Loan::class, inversedBy: 'feeBreakdowns')]
    #[ORM\JoinColumn(name: 'loan_id', referencedColumnName: 'id', nullable: false)]
    private Loan $loan;

    #[ORM\ManyToOne(targetEntity: FeeType::class)]
    #[ORM\JoinColumn(name: 'fee_type_id', referencedColumnName: 'id', nullable: false)]
    private FeeType $feeType;

    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)]
    private string $amount = '0.00';

    #[ORM\Column(type: 'string', length: 20, enumType: FeeCalculationType::class)]
    private FeeCalculationType $calculationType;

    /** The configured value used to compute (flat amount or rate) */
    #[ORM\Column(type: 'decimal', precision: 15, scale: 6)]
    private string $baseValue = '0.000000';

    #[ORM\Column(type: 'boolean', options: ['default' => true])]
    private bool $isDeducted = true;

    public function __construct() { $this->id = Uuid::uuid4()->toString(); }

    public function getId(): string { return $this->id; }
    public function getLoan(): Loan { return $this->loan; }
    public function setLoan(Loan $v): void { $this->loan = $v; }
    public function getFeeType(): FeeType { return $this->feeType; }
    public function setFeeType(FeeType $v): void { $this->feeType = $v; }
    public function getAmount(): string { return $this->amount; }
    public function setAmount(string $v): void { $this->amount = $v; }
    public function getCalculationType(): FeeCalculationType { return $this->calculationType; }
    public function setCalculationType(FeeCalculationType $v): void { $this->calculationType = $v; }
    public function getBaseValue(): string { return $this->baseValue; }
    public function setBaseValue(string $v): void { $this->baseValue = $v; }
    public function isDeducted(): bool { return $this->isDeducted; }
    public function setIsDeducted(bool $v): void { $this->isDeducted = $v; }

    public function toArray(): array
    {
        return [
            'id' => $this->id, 'loan_id' => $this->loan->getId(),
            'fee_type_id' => $this->feeType->getId(), 'fee_type_name' => $this->feeType->getName(),
            'fee_type_code' => $this->feeType->getCode(),
            'amount' => $this->amount, 'calculation_type' => $this->calculationType->value,
            'base_value' => $this->baseValue, 'is_deducted' => $this->isDeducted,
        ];
    }
}
