<?php

declare(strict_types=1);

namespace App\Domain\Entity;

use App\Domain\Enum\ConditionOperator;
use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

#[ORM\Entity]
#[ORM\Table(name: 'approval_conditions')]
#[ORM\HasLifecycleCallbacks]
class ApprovalCondition
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\ManyToOne(targetEntity: ApprovalWorkflow::class, inversedBy: 'conditions')]
    #[ORM\JoinColumn(name: 'workflow_id', referencedColumnName: 'id', nullable: false)]
    private ApprovalWorkflow $workflow;

    /** The loan field to evaluate: amount, tenure, product_type, branch, etc. */
    #[ORM\Column(type: 'string', length: 50)]
    private string $field;

    #[ORM\Column(type: 'string', length: 10, enumType: ConditionOperator::class)]
    private ConditionOperator $operator;

    /** Threshold value (string for flexibility — could be number, enum, JSON array) */
    #[ORM\Column(type: 'string', length: 500)]
    private string $value;

    /** The additional step to inject when condition matches */
    #[ORM\ManyToOne(targetEntity: ApprovalStep::class)]
    #[ORM\JoinColumn(name: 'additional_step_id', referencedColumnName: 'id', nullable: false)]
    private ApprovalStep $additionalStep;

    #[ORM\Column(type: 'boolean', options: ['default' => true])]
    private bool $isActive = true;

    public function __construct()
    {
        $this->id = Uuid::uuid4()->toString();
    }

    public function getId(): string { return $this->id; }
    public function getWorkflow(): ApprovalWorkflow { return $this->workflow; }
    public function setWorkflow(ApprovalWorkflow $v): void { $this->workflow = $v; }
    public function getField(): string { return $this->field; }
    public function setField(string $v): void { $this->field = $v; }
    public function getOperator(): ConditionOperator { return $this->operator; }
    public function setOperator(ConditionOperator $v): void { $this->operator = $v; }
    public function getValue(): string { return $this->value; }
    public function setValue(string $v): void { $this->value = $v; }
    public function getAdditionalStep(): ApprovalStep { return $this->additionalStep; }
    public function setAdditionalStep(ApprovalStep $v): void { $this->additionalStep = $v; }
    public function isActive(): bool { return $this->isActive; }
    public function setIsActive(bool $v): void { $this->isActive = $v; }

    /**
     * Evaluate this condition against a loan.
     */
    public function evaluate(Loan $loan): bool
    {
        $actual = match ($this->field) {
            'amount'       => $loan->getAmountRequested(),
            'tenure'       => (string) $loan->getTenure(),
            'product_code' => $loan->getProduct()->getCode(),
            'branch_id'    => $loan->getBranch()?->getId() ?? '',
            'loan_type'    => $loan->getLoanType()->value,
            default        => '',
        };

        $threshold = $this->value;
        if ($this->operator === ConditionOperator::IN) {
            $threshold = json_decode($threshold, true) ?? [$threshold];
        }

        return $this->operator->evaluate($actual, $threshold);
    }

    public function toArray(): array
    {
        return [
            'id'                 => $this->id,
            'workflow_id'        => $this->workflow->getId(),
            'field'              => $this->field,
            'operator'           => $this->operator->value,
            'value'              => $this->value,
            'additional_step_id' => $this->additionalStep->getId(),
            'additional_step_name' => $this->additionalStep->getName(),
            'is_active'          => $this->isActive,
            'created_at'         => $this->createdAt->format('Y-m-d H:i:s'),
        ];
    }
}
