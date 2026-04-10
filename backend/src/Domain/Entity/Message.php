<?php
declare(strict_types=1);
namespace App\Domain\Entity;

use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

#[ORM\Entity]
#[ORM\Table(name: 'messages')]
#[ORM\Index(name: 'idx_msg_conversation', columns: ['conversation_id'])]
#[ORM\HasLifecycleCallbacks]
class Message
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\ManyToOne(targetEntity: Conversation::class, inversedBy: 'messages')]
    #[ORM\JoinColumn(name: 'conversation_id', referencedColumnName: 'id', nullable: false)]
    private Conversation $conversation;

    #[ORM\Column(type: 'string', length: 36)]
    private string $senderId;

    #[ORM\Column(type: 'text')]
    private string $body;

    #[ORM\Column(type: 'string', length: 500, nullable: true)]
    private ?string $attachmentPath = null;

    #[ORM\Column(type: 'string', length: 200, nullable: true)]
    private ?string $attachmentName = null;

    #[ORM\Column(type: 'string', length: 100, nullable: true)]
    private ?string $attachmentMime = null;

    #[ORM\Column(type: 'boolean', options: ['default' => false])]
    private bool $isRead = false;

    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $readAt = null;

    public function __construct() { $this->id = Uuid::uuid4()->toString(); }

    public function getId(): string { return $this->id; }
    public function getConversation(): Conversation { return $this->conversation; }
    public function setConversation(Conversation $v): void { $this->conversation = $v; }
    public function getSenderId(): string { return $this->senderId; }
    public function setSenderId(string $v): void { $this->senderId = $v; }
    public function getBody(): string { return $this->body; }
    public function setBody(string $v): void { $this->body = trim($v); }
    public function getAttachmentPath(): ?string { return $this->attachmentPath; }
    public function setAttachmentPath(?string $v): void { $this->attachmentPath = $v; }
    public function getAttachmentName(): ?string { return $this->attachmentName; }
    public function setAttachmentName(?string $v): void { $this->attachmentName = $v; }
    public function getAttachmentMime(): ?string { return $this->attachmentMime; }
    public function setAttachmentMime(?string $v): void { $this->attachmentMime = $v; }
    public function isRead(): bool { return $this->isRead; }
    public function markRead(): void
    {
        $this->isRead = true;
        $this->readAt = new \DateTimeImmutable('now', new \DateTimeZone($_ENV['APP_TIMEZONE'] ?? 'Africa/Lagos'));
    }
    public function getReadAt(): ?\DateTimeImmutable { return $this->readAt; }

    public function toArray(): array
    {
        return [
            'id' => $this->id, 'conversation_id' => $this->conversation->getId(),
            'sender_id' => $this->senderId, 'body' => $this->body,
            'attachment_path' => $this->attachmentPath, 'attachment_name' => $this->attachmentName,
            'attachment_mime' => $this->attachmentMime,
            'is_read' => $this->isRead, 'read_at' => $this->readAt?->format('Y-m-d H:i:s'),
            'created_at' => $this->createdAt->format('Y-m-d H:i:s'),
        ];
    }
}
