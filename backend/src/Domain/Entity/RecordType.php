<?php

declare(strict_types=1);

namespace App\Domain\Entity;

use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

#[ORM\Entity(repositoryClass: \App\Domain\Repository\RecordTypeRepository::class)]
#[ORM\Table(name: 'record_types')]
#[ORM\UniqueConstraint(name: 'uniq_record_types_code', columns: ['code'])]
#[ORM\HasLifecycleCallbacks]
class RecordType
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\Column(type: 'string', length: 100)]
    private string $name;

    #[ORM\Column(type: 'string', length: 50, unique: true)]
    private string $code;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $description = null;

    /**
     * JSON config for type-specific validation rules and display labels.
     * Example: {"required_fields": ["gross_pay","organization"], "label_overrides": {"staff_id": "IPPIS Number"}}
     */
    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $fieldConfig = null;

    /**
     * JSON config for eligibility rules.
     * Example: {"max_age": 57, "max_service_years": 33}
     */
    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $eligibilityRules = null;

    #[ORM\Column(type: 'boolean', options: ['default' => true])]
    private bool $isActive = true;

    /** @var Collection<int, GovernmentRecord> */
    #[ORM\OneToMany(targetEntity: GovernmentRecord::class, mappedBy: 'recordType')]
    private Collection $records;

    public function __construct()
    {
        $this->id = Uuid::uuid4()->toString();
        $this->records = new ArrayCollection();
    }

    public function getId(): string { return $this->id; }
    public function getName(): string { return $this->name; }
    public function setName(string $name): void { $this->name = trim($name); }
    public function getCode(): string { return $this->code; }
    public function setCode(string $code): void { $this->code = strtoupper(trim($code)); }
    public function getDescription(): ?string { return $this->description; }
    public function setDescription(?string $description): void { $this->description = $description; }
    public function getFieldConfig(): ?array { return $this->fieldConfig; }
    public function setFieldConfig(?array $config): void { $this->fieldConfig = $config; }
    public function getEligibilityRules(): ?array { return $this->eligibilityRules; }
    public function setEligibilityRules(?array $rules): void { $this->eligibilityRules = $rules; }
    public function isActive(): bool { return $this->isActive; }
    public function setIsActive(bool $isActive): void { $this->isActive = $isActive; }

    /** @return Collection<int, GovernmentRecord> */
    public function getRecords(): Collection { return $this->records; }

    public function getRecordCount(): int
    {
        return $this->records->count();
    }

    public function toArray(): array
    {
        return [
            'id'               => $this->id,
            'name'             => $this->name,
            'code'             => $this->code,
            'description'      => $this->description,
            'field_config'     => $this->fieldConfig,
            'eligibility_rules' => $this->eligibilityRules,
            'is_active'        => $this->isActive,
            'record_count'     => $this->records->isInitialized() ? $this->records->count() : null,
            'created_at'       => $this->createdAt->format('Y-m-d H:i:s'),
            'updated_at'       => $this->updatedAt->format('Y-m-d H:i:s'),
        ];
    }
}
