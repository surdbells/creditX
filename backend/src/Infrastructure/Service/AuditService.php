<?php

declare(strict_types=1);

namespace App\Infrastructure\Service;

use App\Domain\Entity\AuditLog;
use App\Domain\Enum\AuditAction;
use Doctrine\ORM\EntityManagerInterface;

final class AuditService
{
    public function __construct(
        private readonly EntityManagerInterface $em,
    ) {
    }

    /**
     * Log an audit event.
     */
    public function log(
        ?string $userId,
        string $entityType,
        string $entityId,
        AuditAction $action,
        ?array $oldValues = null,
        ?array $newValues = null,
        ?string $ipAddress = null,
        ?string $userAgent = null,
    ): void {
        $log = AuditLog::create(
            action: $action,
            entityType: $entityType,
            entityId: $entityId,
            userId: $userId,
            oldValues: $oldValues,
            newValues: $newValues,
            ipAddress: $ipAddress,
            userAgent: $userAgent,
        );

        $this->em->persist($log);
        $this->em->flush();
    }

    /**
     * Log a create action.
     */
    public function logCreate(
        ?string $userId,
        string $entityType,
        string $entityId,
        array $newValues,
        ?string $ip = null,
        ?string $ua = null,
    ): void {
        $this->log($userId, $entityType, $entityId, AuditAction::CREATE, null, $newValues, $ip, $ua);
    }

    /**
     * Log an update action.
     */
    public function logUpdate(
        ?string $userId,
        string $entityType,
        string $entityId,
        array $oldValues,
        array $newValues,
        ?string $ip = null,
        ?string $ua = null,
    ): void {
        $this->log($userId, $entityType, $entityId, AuditAction::UPDATE, $oldValues, $newValues, $ip, $ua);
    }

    /**
     * Log a delete action.
     */
    public function logDelete(
        ?string $userId,
        string $entityType,
        string $entityId,
        array $oldValues,
        ?string $ip = null,
        ?string $ua = null,
    ): void {
        $this->log($userId, $entityType, $entityId, AuditAction::DELETE, $oldValues, null, $ip, $ua);
    }
}
