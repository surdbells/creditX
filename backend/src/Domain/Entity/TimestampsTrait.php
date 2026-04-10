<?php

declare(strict_types=1);

namespace App\Domain\Entity;

use Doctrine\ORM\Mapping as ORM;

trait TimestampsTrait
{
    #[ORM\Column(name: 'created_at', type: 'datetime_immutable', options: ['default' => 'CURRENT_TIMESTAMP'])]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column(name: 'updated_at', type: 'datetime_immutable', options: ['default' => 'CURRENT_TIMESTAMP'])]
    private \DateTimeImmutable $updatedAt;

    #[ORM\Column(name: 'created_by', type: 'string', length: 36, nullable: true)]
    private ?string $createdBy = null;

    #[ORM\Column(name: 'updated_by', type: 'string', length: 36, nullable: true)]
    private ?string $updatedBy = null;

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function getUpdatedAt(): \DateTimeImmutable
    {
        return $this->updatedAt;
    }

    public function getCreatedBy(): ?string
    {
        return $this->createdBy;
    }

    public function setCreatedBy(?string $createdBy): void
    {
        $this->createdBy = $createdBy;
    }

    public function getUpdatedBy(): ?string
    {
        return $this->updatedBy;
    }

    public function setUpdatedBy(?string $updatedBy): void
    {
        $this->updatedBy = $updatedBy;
    }

    #[ORM\PrePersist]
    public function onPrePersist(): void
    {
        $now = new \DateTimeImmutable('now', new \DateTimeZone($_ENV['APP_TIMEZONE'] ?? 'Africa/Lagos'));
        $this->createdAt = $now;
        $this->updatedAt = $now;
    }

    #[ORM\PreUpdate]
    public function onPreUpdate(): void
    {
        $this->updatedAt = new \DateTimeImmutable('now', new \DateTimeZone($_ENV['APP_TIMEZONE'] ?? 'Africa/Lagos'));
    }
}
