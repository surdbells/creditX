<?php

declare(strict_types=1);

namespace App\Domain\Entity;

use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

#[ORM\Entity(repositoryClass: \App\Domain\Repository\FeeTypeRepository::class)]
#[ORM\Table(name: 'fee_types')]
#[ORM\UniqueConstraint(name: 'uniq_fee_types_code', columns: ['code'])]
#[ORM\HasLifecycleCallbacks]
class FeeType
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\Column(type: 'string', length: 100)]
    private string $name;

    #[ORM\Column(type: 'string', length: 20, unique: true)]
    private string $code;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $description = null;

    /** GL account ID for auto journal posting */
    #[ORM\Column(type: 'string', length: 36, nullable: true)]
    private ?string $glAccountId = null;

    /** System fee types cannot be deleted */
    #[ORM\Column(type: 'boolean', options: ['default' => false])]
    private bool $isSystem = false;

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
    public function getGlAccountId(): ?string { return $this->glAccountId; }
    public function setGlAccountId(?string $v): void { $this->glAccountId = $v; }
    public function isSystem(): bool { return $this->isSystem; }
    public function setIsSystem(bool $v): void { $this->isSystem = $v; }
    public function isActive(): bool { return $this->isActive; }
    public function setIsActive(bool $v): void { $this->isActive = $v; }

    public function toArray(): array
    {
        return [
            'id'            => $this->id,
            'name'          => $this->name,
            'code'          => $this->code,
            'description'   => $this->description,
            'gl_account_id' => $this->glAccountId,
            'is_system'     => $this->isSystem,
            'is_active'     => $this->isActive,
            'created_at'    => $this->createdAt->format('Y-m-d H:i:s'),
            'updated_at'    => $this->updatedAt->format('Y-m-d H:i:s'),
        ];
    }
}
