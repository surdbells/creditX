<?php

declare(strict_types=1);

namespace App\Domain\Entity;

use App\Domain\Enum\UserStatus;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;
use Ramsey\Uuid\UuidInterface;

#[ORM\Entity(repositoryClass: \App\Domain\Repository\UserRepository::class)]
#[ORM\Table(name: 'users')]
#[ORM\Index(name: 'idx_users_email', columns: ['email'])]
#[ORM\Index(name: 'idx_users_status', columns: ['status'])]
#[ORM\HasLifecycleCallbacks]
class User
{
    use TimestampsTrait;
    use SoftDeleteTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\Column(type: 'string', length: 100)]
    private string $firstName;

    #[ORM\Column(type: 'string', length: 100)]
    private string $lastName;

    #[ORM\Column(type: 'string', length: 255, unique: true)]
    private string $email;

    #[ORM\Column(type: 'string', length: 255)]
    private string $passwordHash;

    #[ORM\Column(type: 'string', length: 20, nullable: true)]
    private ?string $phone = null;

    #[ORM\Column(type: 'string', length: 20, enumType: UserStatus::class)]
    private UserStatus $status;

    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $lastLoginAt = null;

    #[ORM\Column(type: 'string', length: 45, nullable: true)]
    private ?string $lastLoginIp = null;

    #[ORM\Column(type: 'string', length: 255, nullable: true)]
    private ?string $passwordResetToken = null;

    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $passwordResetExpiresAt = null;

    /** @var Collection<int, Role> */
    #[ORM\ManyToMany(targetEntity: Role::class, inversedBy: 'users')]
    #[ORM\JoinTable(name: 'user_roles')]
    #[ORM\JoinColumn(name: 'user_id', referencedColumnName: 'id')]
    #[ORM\InverseJoinColumn(name: 'role_id', referencedColumnName: 'id')]
    private Collection $roles;

    /** @var Collection<int, Location> */
    #[ORM\ManyToMany(targetEntity: Location::class, inversedBy: 'users')]
    #[ORM\JoinTable(name: 'user_locations')]
    #[ORM\JoinColumn(name: 'user_id', referencedColumnName: 'id')]
    #[ORM\InverseJoinColumn(name: 'location_id', referencedColumnName: 'id')]
    private Collection $locations;

    public function __construct()
    {
        $this->id = Uuid::uuid4()->toString();
        $this->status = UserStatus::ACTIVE;
        $this->roles = new ArrayCollection();
        $this->locations = new ArrayCollection();
    }

    // ─── Getters ───

    public function getId(): string
    {
        return $this->id;
    }

    public function getFirstName(): string
    {
        return $this->firstName;
    }

    public function getLastName(): string
    {
        return $this->lastName;
    }

    public function getFullName(): string
    {
        return $this->firstName . ' ' . $this->lastName;
    }

    public function getEmail(): string
    {
        return $this->email;
    }

    public function getPasswordHash(): string
    {
        return $this->passwordHash;
    }

    public function getPhone(): ?string
    {
        return $this->phone;
    }

    public function getStatus(): UserStatus
    {
        return $this->status;
    }

    public function getLastLoginAt(): ?\DateTimeImmutable
    {
        return $this->lastLoginAt;
    }

    public function getLastLoginIp(): ?string
    {
        return $this->lastLoginIp;
    }

    public function getPasswordResetToken(): ?string
    {
        return $this->passwordResetToken;
    }

    public function getPasswordResetExpiresAt(): ?\DateTimeImmutable
    {
        return $this->passwordResetExpiresAt;
    }

    /** @return Collection<int, Role> */
    public function getRoles(): Collection
    {
        return $this->roles;
    }

    /** @return Collection<int, Location> */
    public function getLocations(): Collection
    {
        return $this->locations;
    }

    // ─── Setters ───

    public function setFirstName(string $firstName): void
    {
        $this->firstName = trim($firstName);
    }

    public function setLastName(string $lastName): void
    {
        $this->lastName = trim($lastName);
    }

    public function setEmail(string $email): void
    {
        $this->email = strtolower(trim($email));
    }

    public function setPasswordHash(string $hash): void
    {
        $this->passwordHash = $hash;
    }

    public function setPhone(?string $phone): void
    {
        $this->phone = $phone;
    }

    public function setStatus(UserStatus $status): void
    {
        $this->status = $status;
    }

    public function recordLogin(string $ip): void
    {
        $this->lastLoginAt = new \DateTimeImmutable('now', new \DateTimeZone($_ENV['APP_TIMEZONE'] ?? 'Africa/Lagos'));
        $this->lastLoginIp = $ip;
    }

    public function setPasswordResetToken(?string $token, ?\DateTimeImmutable $expiresAt = null): void
    {
        $this->passwordResetToken = $token;
        $this->passwordResetExpiresAt = $expiresAt;
    }

    public function clearPasswordResetToken(): void
    {
        $this->passwordResetToken = null;
        $this->passwordResetExpiresAt = null;
    }

    // ─── Role management ───

    public function addRole(Role $role): void
    {
        if (!$this->roles->contains($role)) {
            $this->roles->add($role);
        }
    }

    public function removeRole(Role $role): void
    {
        $this->roles->removeElement($role);
    }

    public function hasRole(string $slug): bool
    {
        return $this->roles->exists(fn(int $i, Role $r) => $r->getSlug() === $slug);
    }

    public function hasPermission(string $permissionSlug): bool
    {
        foreach ($this->roles as $role) {
            if ($role->hasPermission($permissionSlug)) {
                return true;
            }
        }
        return false;
    }

    /**
     * @return string[]
     */
    public function getAllPermissionSlugs(): array
    {
        $slugs = [];
        foreach ($this->roles as $role) {
            foreach ($role->getPermissions() as $permission) {
                $slugs[] = $permission->getSlug();
            }
        }
        return array_unique($slugs);
    }

    // ─── Location management ───

    public function addLocation(Location $location): void
    {
        if (!$this->locations->contains($location)) {
            $this->locations->add($location);
        }
    }

    public function removeLocation(Location $location): void
    {
        $this->locations->removeElement($location);
    }

    public function clearLocations(): void
    {
        $this->locations->clear();
    }

    // ─── Serialization ───

    public function toArray(bool $includeRelations = false): array
    {
        $data = [
            'id'            => $this->id,
            'first_name'    => $this->firstName,
            'last_name'     => $this->lastName,
            'full_name'     => $this->getFullName(),
            'email'         => $this->email,
            'phone'         => $this->phone,
            'status'        => $this->status->value,
            'last_login_at' => $this->lastLoginAt?->format('Y-m-d H:i:s'),
            'created_at'    => $this->createdAt->format('Y-m-d H:i:s'),
            'updated_at'    => $this->updatedAt->format('Y-m-d H:i:s'),
        ];

        if ($includeRelations) {
            $data['roles'] = $this->roles->map(fn(Role $r) => $r->toArray())->toArray();
            $data['locations'] = $this->locations->map(fn(Location $l) => $l->toArray())->toArray();
        }

        return $data;
    }
}
