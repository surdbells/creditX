<?php
declare(strict_types=1);
namespace App\Domain\Entity;

use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

#[ORM\Entity]
#[ORM\Table(name: 'channels')]
#[ORM\HasLifecycleCallbacks]
class Channel
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\Column(type: 'string', length: 200)]
    private string $name;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $description = null;

    #[ORM\Column(type: 'string', length: 20, options: ['default' => 'group'])]
    private string $type = 'group'; // 'group' | 'channel' | 'direct'

    #[ORM\Column(type: 'string', length: 36)]
    private string $createdBy;

    #[ORM\Column(type: 'boolean', options: ['default' => true])]
    private bool $isActive = true;

    public function __construct() { $this->id = Uuid::uuid4()->toString(); }

    public function getId(): string { return $this->id; }
    public function getName(): string { return $this->name; }
    public function setName(string $v): void { $this->name = $v; }
    public function getDescription(): ?string { return $this->description; }
    public function setDescription(?string $v): void { $this->description = $v; }
    public function getType(): string { return $this->type; }
    public function setType(string $v): void { $this->type = $v; }
    public function getCreatedBy(): string { return $this->createdBy; }
    public function setCreatedBy(string $v): void { $this->createdBy = $v; }
    public function getIsActive(): bool { return $this->isActive; }
    public function setIsActive(bool $v): void { $this->isActive = $v; }

    public function toArray(): array {
        return [
            'id' => $this->id, 'name' => $this->name, 'description' => $this->description,
            'type' => $this->type, 'created_by' => $this->createdBy, 'is_active' => $this->isActive,
            'created_at' => $this->createdAt->format('Y-m-d H:i:s'),
        ];
    }
}
