<?php
declare(strict_types=1);
namespace App\Domain\Entity;

use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

#[ORM\Entity]
#[ORM\Table(name: 'channel_messages')]
#[ORM\Index(name: 'idx_chmsg_channel', columns: ['channel_id'])]
#[ORM\HasLifecycleCallbacks]
class ChannelMessage
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\ManyToOne(targetEntity: Channel::class)]
    #[ORM\JoinColumn(name: 'channel_id', referencedColumnName: 'id', nullable: false)]
    private Channel $channel;

    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(name: 'sender_id', referencedColumnName: 'id', nullable: false)]
    private User $sender;

    #[ORM\Column(type: 'text')]
    private string $body;

    public function __construct() { $this->id = Uuid::uuid4()->toString(); }

    public function getId(): string { return $this->id; }
    public function getChannel(): Channel { return $this->channel; }
    public function setChannel(Channel $v): void { $this->channel = $v; }
    public function getSender(): User { return $this->sender; }
    public function setSender(User $v): void { $this->sender = $v; }
    public function getBody(): string { return $this->body; }
    public function setBody(string $v): void { $this->body = $v; }

    public function toArray(): array {
        return [
            'id' => $this->id, 'channel_id' => $this->channel->getId(),
            'sender_id' => $this->sender->getId(), 'sender_name' => $this->sender->getFullName(),
            'body' => $this->body, 'created_at' => $this->createdAt->format('Y-m-d H:i:s'),
        ];
    }
}
