<?php

declare(strict_types=1);

namespace App\Domain\Entity;

use App\Domain\Enum\ApprovalMode;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

#[ORM\Entity(repositoryClass: \App\Domain\Repository\ApprovalWorkflowRepository::class)]
#[ORM\Table(name: 'approval_workflows')]
#[ORM\HasLifecycleCallbacks]
class ApprovalWorkflow
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\OneToOne(targetEntity: LoanProduct::class)]
    #[ORM\JoinColumn(name: 'product_id', referencedColumnName: 'id', nullable: false, unique: true)]
    private LoanProduct $product;

    #[ORM\Column(type: 'string', length: 150)]
    private string $name;

    #[ORM\Column(type: 'string', length: 20, enumType: ApprovalMode::class)]
    private ApprovalMode $mode = ApprovalMode::SEQUENTIAL;

    #[ORM\Column(type: 'boolean', options: ['default' => true])]
    private bool $isActive = true;

    /** @var Collection<int, ApprovalStep> */
    #[ORM\OneToMany(targetEntity: ApprovalStep::class, mappedBy: 'workflow', cascade: ['persist', 'remove'], orphanRemoval: true)]
    #[ORM\OrderBy(['stepOrder' => 'ASC'])]
    private Collection $steps;

    /** @var Collection<int, ApprovalCondition> */
    #[ORM\OneToMany(targetEntity: ApprovalCondition::class, mappedBy: 'workflow', cascade: ['persist', 'remove'], orphanRemoval: true)]
    private Collection $conditions;

    public function __construct()
    {
        $this->id = Uuid::uuid4()->toString();
        $this->steps = new ArrayCollection();
        $this->conditions = new ArrayCollection();
    }

    public function getId(): string { return $this->id; }
    public function getProduct(): LoanProduct { return $this->product; }
    public function setProduct(LoanProduct $v): void { $this->product = $v; }
    public function getName(): string { return $this->name; }
    public function setName(string $v): void { $this->name = trim($v); }
    public function getMode(): ApprovalMode { return $this->mode; }
    public function setMode(ApprovalMode $v): void { $this->mode = $v; }
    public function isActive(): bool { return $this->isActive; }
    public function setIsActive(bool $v): void { $this->isActive = $v; }

    /** @return Collection<int, ApprovalStep> */
    public function getSteps(): Collection { return $this->steps; }

    /** @return Collection<int, ApprovalCondition> */
    public function getConditions(): Collection { return $this->conditions; }

    public function addStep(ApprovalStep $step): void
    {
        $step->setWorkflow($this);
        $this->steps->add($step);
    }

    public function removeStep(ApprovalStep $step): void
    {
        $this->steps->removeElement($step);
    }

    public function clearSteps(): void
    {
        $this->steps->clear();
    }

    public function addCondition(ApprovalCondition $condition): void
    {
        $condition->setWorkflow($this);
        $this->conditions->add($condition);
    }

    public function clearConditions(): void
    {
        $this->conditions->clear();
    }

    public function toArray(bool $includeRelations = true): array
    {
        $data = [
            'id'           => $this->id,
            'product_id'   => $this->product->getId(),
            'product_name' => $this->product->getName(),
            'name'         => $this->name,
            'mode'         => $this->mode->value,
            'is_active'    => $this->isActive,
            'created_at'   => $this->createdAt->format('Y-m-d H:i:s'),
            'updated_at'   => $this->updatedAt->format('Y-m-d H:i:s'),
        ];

        if ($includeRelations) {
            $data['steps'] = $this->steps->map(fn(ApprovalStep $s) => $s->toArray())->toArray();
            $data['conditions'] = $this->conditions->map(fn(ApprovalCondition $c) => $c->toArray())->toArray();
        }

        return $data;
    }
}
