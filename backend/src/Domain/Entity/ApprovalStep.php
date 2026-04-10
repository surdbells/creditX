<?php

declare(strict_types=1);

namespace App\Domain\Entity;

use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

#[ORM\Entity]
#[ORM\Table(name: 'approval_steps')]
#[ORM\Index(name: 'idx_approval_steps_workflow', columns: ['workflow_id'])]
#[ORM\HasLifecycleCallbacks]
class ApprovalStep
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\ManyToOne(targetEntity: ApprovalWorkflow::class, inversedBy: 'steps')]
    #[ORM\JoinColumn(name: 'workflow_id', referencedColumnName: 'id', nullable: false)]
    private ApprovalWorkflow $workflow;

    #[ORM\Column(type: 'integer')]
    private int $stepOrder = 1;

    #[ORM\ManyToOne(targetEntity: Role::class)]
    #[ORM\JoinColumn(name: 'role_id', referencedColumnName: 'id', nullable: false)]
    private Role $role;

    #[ORM\Column(type: 'string', length: 150)]
    private string $name;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $description = null;

    #[ORM\Column(type: 'boolean', options: ['default' => true])]
    private bool $isMandatory = true;

    /** If set, auto-approve after this many hours if no action taken */
    #[ORM\Column(type: 'integer', nullable: true)]
    private ?int $autoApproveAfterHours = null;

    /** SLA tracking — expected turnaround time in hours */
    #[ORM\Column(type: 'integer', nullable: true)]
    private ?int $slaHours = null;

    /** Whether this is a conditional step (injected by ApprovalCondition) */
    #[ORM\Column(type: 'boolean', options: ['default' => false])]
    private bool $isConditional = false;

    public function __construct()
    {
        $this->id = Uuid::uuid4()->toString();
    }

    public function getId(): string { return $this->id; }
    public function getWorkflow(): ApprovalWorkflow { return $this->workflow; }
    public function setWorkflow(ApprovalWorkflow $v): void { $this->workflow = $v; }
    public function getStepOrder(): int { return $this->stepOrder; }
    public function setStepOrder(int $v): void { $this->stepOrder = max(1, $v); }
    public function getRole(): Role { return $this->role; }
    public function setRole(Role $v): void { $this->role = $v; }
    public function getName(): string { return $this->name; }
    public function setName(string $v): void { $this->name = trim($v); }
    public function getDescription(): ?string { return $this->description; }
    public function setDescription(?string $v): void { $this->description = $v; }
    public function isMandatory(): bool { return $this->isMandatory; }
    public function setIsMandatory(bool $v): void { $this->isMandatory = $v; }
    public function getAutoApproveAfterHours(): ?int { return $this->autoApproveAfterHours; }
    public function setAutoApproveAfterHours(?int $v): void { $this->autoApproveAfterHours = $v; }
    public function getSlaHours(): ?int { return $this->slaHours; }
    public function setSlaHours(?int $v): void { $this->slaHours = $v; }
    public function isConditional(): bool { return $this->isConditional; }
    public function setIsConditional(bool $v): void { $this->isConditional = $v; }

    public function toArray(): array
    {
        return [
            'id'                       => $this->id,
            'workflow_id'              => $this->workflow->getId(),
            'step_order'               => $this->stepOrder,
            'role_id'                  => $this->role->getId(),
            'role_name'                => $this->role->getName(),
            'role_slug'                => $this->role->getSlug(),
            'name'                     => $this->name,
            'description'              => $this->description,
            'is_mandatory'             => $this->isMandatory,
            'auto_approve_after_hours' => $this->autoApproveAfterHours,
            'sla_hours'                => $this->slaHours,
            'is_conditional'           => $this->isConditional,
            'created_at'               => $this->createdAt->format('Y-m-d H:i:s'),
        ];
    }
}
