<?php
declare(strict_types=1);
namespace App\Domain\Entity;

use App\Domain\Enum\NotificationChannel;
use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

#[ORM\Entity(repositoryClass: \App\Domain\Repository\NotificationTemplateRepository::class)]
#[ORM\Table(name: 'notification_templates')]
#[ORM\UniqueConstraint(name: 'uniq_nt_code', columns: ['code'])]
#[ORM\HasLifecycleCallbacks]
class NotificationTemplate
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\Column(type: 'string', length: 100)]
    private string $name;

    #[ORM\Column(type: 'string', length: 50, unique: true)]
    private string $code;

    #[ORM\Column(type: 'string', length: 20, enumType: NotificationChannel::class)]
    private NotificationChannel $channel;

    #[ORM\Column(type: 'string', length: 200, nullable: true)]
    private ?string $subject = null;

    /** Body with {{placeholder}} support: {{customer_name}}, {{loan_amount}}, {{due_date}}, etc. */
    #[ORM\Column(type: 'text')]
    private string $body;

    /** Event that triggers this template: loan_submitted, loan_approved, loan_disbursed, payment_received, overdue_reminder, etc. */
    #[ORM\Column(type: 'string', length: 50, nullable: true)]
    private ?string $eventTrigger = null;

    #[ORM\Column(type: 'boolean', options: ['default' => true])]
    private bool $isActive = true;

    public function __construct() { $this->id = Uuid::uuid4()->toString(); }

    public function getId(): string { return $this->id; }
    public function getName(): string { return $this->name; }
    public function setName(string $v): void { $this->name = trim($v); }
    public function getCode(): string { return $this->code; }
    public function setCode(string $v): void { $this->code = strtoupper(trim($v)); }
    public function getChannel(): NotificationChannel { return $this->channel; }
    public function setChannel(NotificationChannel $v): void { $this->channel = $v; }
    public function getSubject(): ?string { return $this->subject; }
    public function setSubject(?string $v): void { $this->subject = $v; }
    public function getBody(): string { return $this->body; }
    public function setBody(string $v): void { $this->body = $v; }
    public function getEventTrigger(): ?string { return $this->eventTrigger; }
    public function setEventTrigger(?string $v): void { $this->eventTrigger = $v; }
    public function isActive(): bool { return $this->isActive; }
    public function setIsActive(bool $v): void { $this->isActive = $v; }

    /**
     * Render body with context variables.
     */
    public function render(array $context): string
    {
        $rendered = $this->body;
        foreach ($context as $key => $value) {
            $rendered = str_replace('{{' . $key . '}}', (string) $value, $rendered);
        }
        return $rendered;
    }

    /**
     * Render subject with context variables.
     */
    public function renderSubject(array $context): ?string
    {
        if ($this->subject === null) return null;
        $rendered = $this->subject;
        foreach ($context as $key => $value) {
            $rendered = str_replace('{{' . $key . '}}', (string) $value, $rendered);
        }
        return $rendered;
    }

    public function toArray(): array
    {
        return [
            'id' => $this->id, 'name' => $this->name, 'code' => $this->code,
            'channel' => $this->channel->value, 'subject' => $this->subject,
            'body' => $this->body, 'event_trigger' => $this->eventTrigger,
            'is_active' => $this->isActive,
            'created_at' => $this->createdAt->format('Y-m-d H:i:s'),
            'updated_at' => $this->updatedAt->format('Y-m-d H:i:s'),
        ];
    }
}
