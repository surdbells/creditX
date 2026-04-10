<?php

declare(strict_types=1);

namespace App\Domain\Entity;

use App\Domain\Enum\SettingCategory;
use App\Domain\Enum\SettingType;
use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

#[ORM\Entity(repositoryClass: \App\Domain\Repository\SystemSettingRepository::class)]
#[ORM\Table(name: 'system_settings')]
#[ORM\UniqueConstraint(name: 'uniq_settings_key', columns: ['setting_key'])]
#[ORM\Index(name: 'idx_settings_category', columns: ['category'])]
#[ORM\HasLifecycleCallbacks]
class SystemSetting
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\Column(name: 'setting_key', type: 'string', length: 150, unique: true)]
    private string $key;

    #[ORM\Column(name: 'setting_value', type: 'text')]
    private string $value;

    #[ORM\Column(type: 'string', length: 20, enumType: SettingType::class)]
    private SettingType $type;

    #[ORM\Column(type: 'string', length: 30, enumType: SettingCategory::class)]
    private SettingCategory $category;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $description = null;

    #[ORM\Column(type: 'boolean', options: ['default' => false])]
    private bool $isEncrypted = false;

    public function __construct()
    {
        $this->id = Uuid::uuid4()->toString();
        $this->type = SettingType::STRING;
        $this->category = SettingCategory::GENERAL;
    }

    public function getId(): string
    {
        return $this->id;
    }

    public function getKey(): string
    {
        return $this->key;
    }

    public function setKey(string $key): void
    {
        $this->key = strtolower(trim($key));
    }

    public function getRawValue(): string
    {
        return $this->value;
    }

    public function getValue(): mixed
    {
        return match ($this->type) {
            SettingType::INTEGER => (int) $this->value,
            SettingType::FLOAT   => (float) $this->value,
            SettingType::BOOLEAN => in_array(strtolower($this->value), ['true', '1', 'yes'], true),
            SettingType::JSON    => json_decode($this->value, true),
            default              => $this->value,
        };
    }

    public function setValue(mixed $value): void
    {
        $this->value = match ($this->type) {
            SettingType::BOOLEAN => $value ? 'true' : 'false',
            SettingType::JSON    => is_string($value) ? $value : json_encode($value),
            default              => (string) $value,
        };
    }

    public function getType(): SettingType
    {
        return $this->type;
    }

    public function setType(SettingType $type): void
    {
        $this->type = $type;
    }

    public function getCategory(): SettingCategory
    {
        return $this->category;
    }

    public function setCategory(SettingCategory $category): void
    {
        $this->category = $category;
    }

    public function getDescription(): ?string
    {
        return $this->description;
    }

    public function setDescription(?string $description): void
    {
        $this->description = $description;
    }

    public function isEncrypted(): bool
    {
        return $this->isEncrypted;
    }

    public function setIsEncrypted(bool $isEncrypted): void
    {
        $this->isEncrypted = $isEncrypted;
    }

    public function toArray(): array
    {
        return [
            'id'          => $this->id,
            'key'         => $this->key,
            'value'       => $this->isEncrypted ? '********' : $this->getValue(),
            'type'        => $this->type->value,
            'category'    => $this->category->value,
            'description' => $this->description,
            'updated_at'  => $this->updatedAt->format('Y-m-d H:i:s'),
        ];
    }
}
