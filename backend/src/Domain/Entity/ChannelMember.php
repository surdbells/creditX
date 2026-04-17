<?php
declare(strict_types=1);
namespace App\Domain\Entity;

use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

#[ORM\Entity]
#[ORM\Table(name: 'channel_members')]
#[ORM\UniqueConstraint(name: 'uniq_channel_member', columns: ['channel_id', 'user_id'])]
#[ORM\HasLifecycleCallbacks]
class ChannelMember
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\ManyToOne(targetEntity: Channel::class)]
    #[ORM\JoinColumn(name: 'channel_id', referencedColumnName: 'id', nullable: false)]
    private Channel $channel;

    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(name: 'user_id', referencedColumnName: 'id', nullable: false)]
    private User $user;

    #[ORM\Column(type: 'string', length: 20, options: ['default' => 'member'])]
    private string $role = 'member'; // 'admin' | 'member'

    public function __construct() { $this->id = Uuid::uuid4()->toString(); }

    public function getId(): string { return $this->id; }
    public function getChannel(): Channel { return $this->channel; }
    public function setChannel(Channel $v): void { $this->channel = $v; }
    public function getUser(): User { return $this->user; }
    public function setUser(User $v): void { $this->user = $v; }
    public function getRole(): string { return $this->role; }
    public function setRole(string $v): void { $this->role = $v; }
}
