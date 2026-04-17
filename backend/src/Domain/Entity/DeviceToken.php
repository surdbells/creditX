<?php
declare(strict_types=1);
namespace App\Domain\Entity;

use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

#[ORM\Entity]
#[ORM\Table(name: 'device_tokens')]
#[ORM\UniqueConstraint(name: 'uniq_device_token', columns: ['token'])]
#[ORM\Index(name: 'idx_device_user', columns: ['user_id'])]
#[ORM\HasLifecycleCallbacks]
class DeviceToken
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(name: 'user_id', referencedColumnName: 'id', nullable: false)]
    private User $user;

    #[ORM\Column(type: 'text')]
    private string $token;

    #[ORM\Column(type: 'string', length: 20)]
    private string $platform; // 'android' | 'ios' | 'web'

    #[ORM\Column(type: 'boolean', options: ['default' => true])]
    private bool $isActive = true;

    public function __construct() { $this->id = Uuid::uuid4()->toString(); }

    public function getId(): string { return $this->id; }
    public function getUser(): User { return $this->user; }
    public function setUser(User $v): void { $this->user = $v; }
    public function getToken(): string { return $this->token; }
    public function setToken(string $v): void { $this->token = $v; }
    public function getPlatform(): string { return $this->platform; }
    public function setPlatform(string $v): void { $this->platform = $v; }
    public function getIsActive(): bool { return $this->isActive; }
    public function setIsActive(bool $v): void { $this->isActive = $v; }

    public function toArray(): array {
        return [
            'id' => $this->id, 'user_id' => $this->user->getId(),
            'platform' => $this->platform, 'is_active' => $this->isActive,
            'created_at' => $this->createdAt->format('Y-m-d H:i:s'),
        ];
    }
}
