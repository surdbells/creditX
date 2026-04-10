<?php

declare(strict_types=1);

namespace App\Domain\Entity;

use Doctrine\ORM\Mapping as ORM;

trait SoftDeleteTrait
{
    #[ORM\Column(name: 'deleted_at', type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $deletedAt = null;

    public function getDeletedAt(): ?\DateTimeImmutable
    {
        return $this->deletedAt;
    }

    public function isDeleted(): bool
    {
        return $this->deletedAt !== null;
    }

    public function softDelete(): void
    {
        $this->deletedAt = new \DateTimeImmutable('now', new \DateTimeZone($_ENV['APP_TIMEZONE'] ?? 'Africa/Lagos'));
    }

    public function restore(): void
    {
        $this->deletedAt = null;
    }
}
