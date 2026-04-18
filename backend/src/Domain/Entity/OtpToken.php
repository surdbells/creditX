<?php
declare(strict_types=1);
namespace App\Domain\Entity;

use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

#[ORM\Entity]
#[ORM\Table(name: 'otp_tokens')]
#[ORM\Index(name: 'idx_otp_user', columns: ['user_id'])]
#[ORM\Index(name: 'idx_otp_code', columns: ['code'])]
class OtpToken
{
    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(name: 'user_id', referencedColumnName: 'id', nullable: false)]
    private User $user;

    #[ORM\Column(type: 'string', length: 6)]
    private string $code;

    #[ORM\Column(type: 'string', length: 20)]
    private string $purpose; // 'login' | 'password_reset'

    #[ORM\Column(type: 'datetime_immutable')]
    private \DateTimeImmutable $expiresAt;

    #[ORM\Column(type: 'boolean', options: ['default' => false])]
    private bool $used = false;

    #[ORM\Column(type: 'datetime_immutable')]
    private \DateTimeImmutable $createdAt;

    public function __construct()
    {
        $this->id = Uuid::uuid4()->toString();
        $this->createdAt = new \DateTimeImmutable('now', new \DateTimeZone($_ENV['APP_TIMEZONE'] ?? 'Africa/Lagos'));
    }

    public static function create(User $user, string $purpose = 'login', int $ttlMinutes = 10): self
    {
        $otp = new self();
        $otp->user = $user;
        $otp->code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        $otp->purpose = $purpose;
        $otp->expiresAt = new \DateTimeImmutable("+{$ttlMinutes} minutes", new \DateTimeZone($_ENV['APP_TIMEZONE'] ?? 'Africa/Lagos'));
        return $otp;
    }

    public function getId(): string { return $this->id; }
    public function getUser(): User { return $this->user; }
    public function getCode(): string { return $this->code; }
    public function getPurpose(): string { return $this->purpose; }
    public function getExpiresAt(): \DateTimeImmutable { return $this->expiresAt; }
    public function isUsed(): bool { return $this->used; }
    public function markUsed(): void { $this->used = true; }

    public function isExpired(): bool
    {
        return new \DateTimeImmutable('now', new \DateTimeZone($_ENV['APP_TIMEZONE'] ?? 'Africa/Lagos')) > $this->expiresAt;
    }

    public function isValid(string $code): bool
    {
        return !$this->used && !$this->isExpired() && $this->code === $code;
    }
}
