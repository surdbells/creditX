<?php
declare(strict_types=1);
namespace App\Domain\Entity;

use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

#[ORM\Entity]
#[ORM\Table(name: 'teams')]
#[ORM\UniqueConstraint(name: 'uniq_teams_code', columns: ['code'])]
#[ORM\HasLifecycleCallbacks]
class Team
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\Column(type: 'string', length: 150)]
    private string $name;

    #[ORM\Column(type: 'string', length: 50)]
    private string $code;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $description = null;

    #[ORM\ManyToOne(targetEntity: Department::class)]
    #[ORM\JoinColumn(name: 'department_id', referencedColumnName: 'id', nullable: true)]
    private ?Department $department = null;

    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(name: 'lead_id', referencedColumnName: 'id', nullable: true)]
    private ?User $lead = null;

    #[ORM\Column(type: 'boolean', options: ['default' => true])]
    private bool $isActive = true;

    public function __construct() { $this->id = Uuid::uuid4()->toString(); }

    public function getId(): string { return $this->id; }
    public function getName(): string { return $this->name; }
    public function setName(string $v): void { $this->name = $v; }
    public function getCode(): string { return $this->code; }
    public function setCode(string $v): void { $this->code = $v; }
    public function getDescription(): ?string { return $this->description; }
    public function setDescription(?string $v): void { $this->description = $v; }
    public function getDepartment(): ?Department { return $this->department; }
    public function setDepartment(?Department $v): void { $this->department = $v; }
    public function getLead(): ?User { return $this->lead; }
    public function setLead(?User $v): void { $this->lead = $v; }
    public function getIsActive(): bool { return $this->isActive; }
    public function setIsActive(bool $v): void { $this->isActive = $v; }

    public function toArray(): array {
        return [
            'id' => $this->id, 'name' => $this->name, 'code' => $this->code,
            'description' => $this->description,
            'department_id' => $this->department?->getId(), 'department_name' => $this->department?->getName(),
            'lead_id' => $this->lead?->getId(), 'lead_name' => $this->lead?->getFullName(),
            'is_active' => $this->isActive,
            'created_at' => $this->createdAt->format('Y-m-d H:i:s'),
            'updated_at' => $this->updatedAt->format('Y-m-d H:i:s'),
        ];
    }
}
