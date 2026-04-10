<?php

declare(strict_types=1);

namespace App\Domain\Entity;

use App\Domain\Enum\AuditAction;
use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

#[ORM\Entity(repositoryClass: \App\Domain\Repository\AuditLogRepository::class)]
#[ORM\Table(name: 'audit_logs')]
#[ORM\Index(name: 'idx_audit_user', columns: ['user_id'])]
#[ORM\Index(name: 'idx_audit_entity', columns: ['entity_type', 'entity_id'])]
#[ORM\Index(name: 'idx_audit_action', columns: ['action'])]
#[ORM\Index(name: 'idx_audit_created', columns: ['created_at'])]
class AuditLog
{
    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\Column(type: 'string', length: 36, nullable: true)]
    private ?string $userId = null;

    #[ORM\Column(type: 'string', length: 150, nullable: true)]
    private ?string $userName = null;

    #[ORM\Column(type: 'string', length: 100)]
    private string $entityType;

    #[ORM\Column(type: 'string', length: 36, nullable: true)]
    private ?string $entityId = null;

    #[ORM\Column(type: 'string', length: 30, enumType: AuditAction::class)]
    private AuditAction $action;

    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $oldValues = null;

    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $newValues = null;

    #[ORM\Column(type: 'string', length: 45, nullable: true)]
    private ?string $ipAddress = null;

    #[ORM\Column(type: 'string', length: 500, nullable: true)]
    private ?string $userAgent = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $description = null;

    #[ORM\Column(type: 'datetime_immutable', options: ['default' => 'CURRENT_TIMESTAMP'])]
    private \DateTimeImmutable $createdAt;

    public function __construct()
    {
        $this->id = Uuid::uuid4()->toString();
        $this->createdAt = new \DateTimeImmutable('now', new \DateTimeZone($_ENV['APP_TIMEZONE'] ?? 'Africa/Lagos'));
    }

    // Factory method for cleaner creation
    public static function create(
        AuditAction $action,
        string $entityType,
        ?string $entityId = null,
        ?string $userId = null,
        ?string $userName = null,
        ?array $oldValues = null,
        ?array $newValues = null,
        ?string $ipAddress = null,
        ?string $userAgent = null,
        ?string $description = null,
    ): self {
        $log = new self();
        $log->action = $action;
        $log->entityType = $entityType;
        $log->entityId = $entityId;
        $log->userId = $userId;
        $log->userName = $userName;
        $log->oldValues = $oldValues;
        $log->newValues = $newValues;
        $log->ipAddress = $ipAddress;
        $log->userAgent = $userAgent;
        $log->description = $description;
        return $log;
    }

    public function getId(): string
    {
        return $this->id;
    }

    public function getUserId(): ?string
    {
        return $this->userId;
    }

    public function getUserName(): ?string
    {
        return $this->userName;
    }

    public function getEntityType(): string
    {
        return $this->entityType;
    }

    public function getEntityId(): ?string
    {
        return $this->entityId;
    }

    public function getAction(): AuditAction
    {
        return $this->action;
    }

    public function getOldValues(): ?array
    {
        return $this->oldValues;
    }

    public function getNewValues(): ?array
    {
        return $this->newValues;
    }

    public function getIpAddress(): ?string
    {
        return $this->ipAddress;
    }

    public function getUserAgent(): ?string
    {
        return $this->userAgent;
    }

    public function getDescription(): ?string
    {
        return $this->description;
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function toArray(): array
    {
        return [
            'id'          => $this->id,
            'user_id'     => $this->userId,
            'user_name'   => $this->userName,
            'entity_type' => $this->entityType,
            'entity_id'   => $this->entityId,
            'action'      => $this->action->value,
            'old_values'  => $this->oldValues,
            'new_values'  => $this->newValues,
            'ip_address'  => $this->ipAddress,
            'description' => $this->description,
            'created_at'  => $this->createdAt->format('Y-m-d H:i:s'),
        ];
    }
}
