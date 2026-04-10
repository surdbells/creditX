<?php
declare(strict_types=1);
namespace App\Domain\Entity;

use App\Domain\Enum\NotificationChannel;
use App\Domain\Enum\NotificationStatus;
use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

#[ORM\Entity(repositoryClass: \App\Domain\Repository\NotificationRepository::class)]
#[ORM\Table(name: 'notifications')]
#[ORM\Index(name: 'idx_notif_user', columns: ['user_id'])]
#[ORM\Index(name: 'idx_notif_status', columns: ['status'])]
#[ORM\HasLifecycleCallbacks]
class Notification
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\Column(type: 'string', length: 36, nullable: true)]
    private ?string $templateId = null;

    /** Target user (for in-app) */
    #[ORM\Column(type: 'string', length: 36, nullable: true)]
    private ?string $userId = null;

    /** Target customer (for SMS/email) */
    #[ORM\Column(type: 'string', length: 36, nullable: true)]
    private ?string $customerId = null;

    #[ORM\Column(type: 'string', length: 20, enumType: NotificationChannel::class)]
    private NotificationChannel $channel;

    /** Email address, phone number, or user ID */
    #[ORM\Column(type: 'string', length: 200)]
    private string $recipient;

    #[ORM\Column(type: 'string', length: 200, nullable: true)]
    private ?string $subject = null;

    #[ORM\Column(type: 'text')]
    private string $body;

    #[ORM\Column(type: 'string', length: 20, enumType: NotificationStatus::class)]
    private NotificationStatus $status = NotificationStatus::QUEUED;

    #[ORM\Column(type: 'integer', options: ['default' => 0])]
    private int $retryCount = 0;

    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $sentAt = null;

    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $deliveredAt = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $errorMessage = null;

    /** Whether the user has read this (for in-app) */
    #[ORM\Column(type: 'boolean', options: ['default' => false])]
    private bool $isRead = false;

    public function __construct() { $this->id = Uuid::uuid4()->toString(); }

    public function getId(): string { return $this->id; }
    public function getTemplateId(): ?string { return $this->templateId; }
    public function setTemplateId(?string $v): void { $this->templateId = $v; }
    public function getUserId(): ?string { return $this->userId; }
    public function setUserId(?string $v): void { $this->userId = $v; }
    public function getCustomerId(): ?string { return $this->customerId; }
    public function setCustomerId(?string $v): void { $this->customerId = $v; }
    public function getChannel(): NotificationChannel { return $this->channel; }
    public function setChannel(NotificationChannel $v): void { $this->channel = $v; }
    public function getRecipient(): string { return $this->recipient; }
    public function setRecipient(string $v): void { $this->recipient = $v; }
    public function getSubject(): ?string { return $this->subject; }
    public function setSubject(?string $v): void { $this->subject = $v; }
    public function getBody(): string { return $this->body; }
    public function setBody(string $v): void { $this->body = $v; }
    public function getStatus(): NotificationStatus { return $this->status; }
    public function setStatus(NotificationStatus $v): void { $this->status = $v; }
    public function getRetryCount(): int { return $this->retryCount; }
    public function incrementRetry(): void { $this->retryCount++; }
    public function getSentAt(): ?\DateTimeImmutable { return $this->sentAt; }
    public function setSentAt(?\DateTimeImmutable $v): void { $this->sentAt = $v; }
    public function getDeliveredAt(): ?\DateTimeImmutable { return $this->deliveredAt; }
    public function setDeliveredAt(?\DateTimeImmutable $v): void { $this->deliveredAt = $v; }
    public function getErrorMessage(): ?string { return $this->errorMessage; }
    public function setErrorMessage(?string $v): void { $this->errorMessage = $v; }
    public function isRead(): bool { return $this->isRead; }
    public function markRead(): void { $this->isRead = true; }

    public function markSent(): void
    {
        $this->status = NotificationStatus::SENT;
        $this->sentAt = new \DateTimeImmutable('now', new \DateTimeZone($_ENV['APP_TIMEZONE'] ?? 'Africa/Lagos'));
    }

    public function markDelivered(): void
    {
        $this->status = NotificationStatus::DELIVERED;
        $this->deliveredAt = new \DateTimeImmutable('now', new \DateTimeZone($_ENV['APP_TIMEZONE'] ?? 'Africa/Lagos'));
    }

    public function markFailed(string $error): void
    {
        $this->status = NotificationStatus::FAILED;
        $this->errorMessage = $error;
    }

    public function toArray(): array
    {
        return [
            'id' => $this->id, 'template_id' => $this->templateId,
            'user_id' => $this->userId, 'customer_id' => $this->customerId,
            'channel' => $this->channel->value, 'recipient' => $this->recipient,
            'subject' => $this->subject, 'body' => $this->body,
            'status' => $this->status->value, 'retry_count' => $this->retryCount,
            'sent_at' => $this->sentAt?->format('Y-m-d H:i:s'),
            'delivered_at' => $this->deliveredAt?->format('Y-m-d H:i:s'),
            'error_message' => $this->errorMessage, 'is_read' => $this->isRead,
            'created_at' => $this->createdAt->format('Y-m-d H:i:s'),
        ];
    }
}
