<?php
declare(strict_types=1);
namespace App\Domain\Entity;

use App\Domain\Enum\ConversationStatus;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

#[ORM\Entity(repositoryClass: \App\Domain\Repository\ConversationRepository::class)]
#[ORM\Table(name: 'conversations')]
#[ORM\Index(name: 'idx_conv_agent', columns: ['agent_id'])]
#[ORM\Index(name: 'idx_conv_loan', columns: ['loan_id'])]
#[ORM\HasLifecycleCallbacks]
class Conversation
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\Column(type: 'string', length: 36, nullable: true)]
    private ?string $loanId = null;

    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(name: 'agent_id', referencedColumnName: 'id', nullable: false)]
    private User $agent;

    #[ORM\Column(type: 'string', length: 200)]
    private string $subject;

    #[ORM\Column(type: 'string', length: 20, enumType: ConversationStatus::class)]
    private ConversationStatus $status = ConversationStatus::OPEN;

    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $lastMessageAt = null;

    /** @var Collection<int, Message> */
    #[ORM\OneToMany(targetEntity: Message::class, mappedBy: 'conversation', cascade: ['persist'], orphanRemoval: true)]
    #[ORM\OrderBy(['createdAt' => 'ASC'])]
    private Collection $messages;

    public function __construct()
    {
        $this->id = Uuid::uuid4()->toString();
        $this->messages = new ArrayCollection();
    }

    public function getId(): string { return $this->id; }
    public function getLoanId(): ?string { return $this->loanId; }
    public function setLoanId(?string $v): void { $this->loanId = $v; }
    public function getAgent(): User { return $this->agent; }
    public function setAgent(User $v): void { $this->agent = $v; }
    public function getSubject(): string { return $this->subject; }
    public function setSubject(string $v): void { $this->subject = trim($v); }
    public function getStatus(): ConversationStatus { return $this->status; }
    public function setStatus(ConversationStatus $v): void { $this->status = $v; }
    public function getLastMessageAt(): ?\DateTimeImmutable { return $this->lastMessageAt; }
    public function setLastMessageAt(?\DateTimeImmutable $v): void { $this->lastMessageAt = $v; }
    /** @return Collection<int, Message> */
    public function getMessages(): Collection { return $this->messages; }

    public function addMessage(Message $msg): void
    {
        $msg->setConversation($this);
        $this->messages->add($msg);
        $this->lastMessageAt = new \DateTimeImmutable('now', new \DateTimeZone($_ENV['APP_TIMEZONE'] ?? 'Africa/Lagos'));
    }

    public function resolve(): void { $this->status = ConversationStatus::RESOLVED; }
    public function close(): void { $this->status = ConversationStatus::CLOSED; }

    public function getUnreadCount(?string $userId): int
    {
        $count = 0;
        foreach ($this->messages as $msg) {
            if (!$msg->isRead() && $msg->getSenderId() !== $userId) $count++;
        }
        return $count;
    }

    public function toArray(bool $includeMessages = false, ?string $forUserId = null): array
    {
        $data = [
            'id' => $this->id, 'loan_id' => $this->loanId,
            'agent_id' => $this->agent->getId(), 'agent_name' => $this->agent->getFullName(),
            'subject' => $this->subject, 'status' => $this->status->value,
            'last_message_at' => $this->lastMessageAt?->format('Y-m-d H:i:s'),
            'unread_count' => $forUserId ? $this->getUnreadCount($forUserId) : null,
            'message_count' => $this->messages->count(),
            'created_at' => $this->createdAt->format('Y-m-d H:i:s'),
        ];
        if ($includeMessages) {
            $data['messages'] = $this->messages->map(fn(Message $m) => $m->toArray())->toArray();
        }
        return $data;
    }
}
