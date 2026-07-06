<?php

declare(strict_types=1);

namespace App\Domain\Entity;

use App\Domain\Enum\UserStatus;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;
use Ramsey\Uuid\UuidInterface;

#[ORM\Entity]
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

    #[ORM\Column(type: 'string', length: 500, nullable: true)]
    private ?string $avatarPath = null;

    #[ORM\Column(name: 'font_scale', type: 'decimal', precision: 3, scale: 2, options: ['default' => '1.00'])]
    private string $fontScale = '1.00';

    /**
     * Whether this user is a field agent. Only agents can capture loans
     * from the mobile app. Non-agents never see a monthly target, even if
     * one is stored on their record (we just don't look at it).
     */
    #[ORM\Column(name: 'is_agent', type: 'boolean', options: ['default' => false])]
    private bool $isAgent = false;

    /**
     * Personal monthly disbursement target in naira (decimal, 15,2).
     * Nullable — when null, the agent's dashboard falls back to the global
     * setting `agent.monthly_target`. Only meaningful when $isAgent is true.
     */
    #[ORM\Column(name: 'monthly_target', type: 'decimal', precision: 15, scale: 2, nullable: true)]
    private ?string $monthlyTarget = null;

    #[ORM\ManyToOne(targetEntity: Department::class)]
    #[ORM\JoinColumn(name: 'department_id', referencedColumnName: 'id', nullable: true)]
    private ?Department $department = null;

    #[ORM\ManyToOne(targetEntity: Team::class)]
    #[ORM\JoinColumn(name: 'team_id', referencedColumnName: 'id', nullable: true)]
    private ?Team $team = null;

    #[ORM\Column(type: 'string', length: 64, nullable: true)]
    private ?string $resetToken = null;

    #[ORM\Column(type: 'string', length: 30, nullable: true)]
    private ?string $resetTokenExpiresAt = null;

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
    #[ORM\ManyToMany(targetEntity: Role::class, )]
    #[ORM\JoinTable(name: 'user_roles')]
    #[ORM\JoinColumn(name: 'user_id', referencedColumnName: 'id')]
    #[ORM\InverseJoinColumn(name: 'role_id', referencedColumnName: 'id')]
    private Collection $roles;

    /** @var Collection<int, Location> */
    #[ORM\ManyToMany(targetEntity: Location::class, )]
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

    public function getAvatarPath(): ?string { return $this->avatarPath; }
    public function setAvatarPath(?string $v): void { $this->avatarPath = $v; }

    public function getFontScale(): float { return (float) $this->fontScale; }
    public function setFontScale(float $v): void {
        // Clamp to supported range
        if ($v < 0.85) $v = 0.85;
        if ($v > 1.20) $v = 1.20;
        $this->fontScale = number_format($v, 2, '.', '');
    }

    public function isAgent(): bool { return $this->isAgent; }
    public function setIsAgent(bool $v): void { $this->isAgent = $v; }

    /**
     * Whether loan visibility must be restricted to this user's own jobs.
     *
     * True only for genuine field agents. A back-office user with loan
     * oversight (super admins, approvers — anyone with loans.approve) is NOT
     * restricted even if they also carry the is_agent flag, so they still see
     * the whole portfolio in the admin app.
     */
    public function isLoanScopedToSelf(): bool
    {
        return $this->isAgent && !$this->hasPermission('loans.approve');
    }

    /** Returns the target as a string (decimal string from DB) or null. */
    public function getMonthlyTarget(): ?string { return $this->monthlyTarget; }

    /**
     * Accepts a string|float|null. Negative values are clamped to 0.
     * Non-numeric input is rejected with an InvalidArgumentException —
     * the caller (action) is expected to have validated input already.
     */
    public function setMonthlyTarget(null|string|float|int $v): void {
        if ($v === null || $v === '') {
            $this->monthlyTarget = null;
            return;
        }
        if (!is_numeric($v)) {
            throw new \InvalidArgumentException('monthly_target must be numeric or null');
        }
        $f = (float) $v;
        if ($f < 0) $f = 0;
        $this->monthlyTarget = number_format($f, 2, '.', '');
    }

    public function getResetToken(): ?string { return $this->resetToken; }
    public function setResetToken(?string $v): void { $this->resetToken = $v; }
    public function getResetTokenExpiresAt(): ?string { return $this->resetTokenExpiresAt; }
    public function setResetTokenExpiresAt(?string $v): void { $this->resetTokenExpiresAt = $v; }

    public function getDepartment(): ?Department { return $this->department; }
    public function setDepartment(?Department $v): void { $this->department = $v; }
    public function getTeam(): ?Team { return $this->team; }
    public function setTeam(?Team $v): void { $this->team = $v; }

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
            'avatar_path'   => $this->avatarPath,
            // Absolute URL — keeps frontends from having to build the URL
            // themselves (they got it wrong when nginx was serving /storage
            // as a static directory). Built from APP_URL env + the /api/storage
            // route alias. Null when there's no avatar, so frontends can fall
            // back to initials.
            'avatar_url'    => $this->buildAvatarUrl(),
            'font_scale'    => (float) $this->fontScale,
            'is_agent'      => $this->isAgent,
            'monthly_target'=> $this->monthlyTarget,  // null or decimal string
            'department_id'   => $this->department?->getId(),
            'department_name' => $this->department?->getName(),
            'team_id'         => $this->team?->getId(),
            'team_name'       => $this->team?->getName(),
            'team_lead_name'  => $this->team?->getLead()?->getFullName(),
            'location_name'   => $this->locations->first() ? $this->locations->first()->getName() : null,
            'status'        => $this->status->value,
            'last_login_at' => $this->lastLoginAt?->format('Y-m-d H:i:s'),
            'created_at'    => $this->createdAt->format('Y-m-d H:i:s'),
            'updated_at'    => $this->updatedAt->format('Y-m-d H:i:s'),
        ];

        if ($includeRelations) {
            // Include each role's permissions so the frontend can resolve what
            // the user may see/do (nav gating, action buttons). Without this,
            // non-super-admin users have an empty permission set client-side and
            // only see ungated screens (the dashboard).
            $data['roles'] = $this->roles->map(fn(Role $r) => $r->toArray(true))->toArray();
            $data['locations'] = $this->locations->map(fn(Location $l) => $l->toArray())->toArray();
        }

        return $data;
    }

    /**
     * Builds an absolute URL for this user's avatar, or null if no
     * avatar is set.
     *
     * Prepends APP_URL from environment (e.g. https://api.dostsuite.com)
     * and uses the /api/storage/ route alias — NOT the legacy /storage/
     * route, which some nginx configs intercept and serve statically,
     * returning 404 when the public/storage symlink is broken or
     * missing. /api/storage/ is guaranteed to be routed to PHP.
     *
     * If APP_URL is unset (dev without .env), falls back to an empty
     * string prefix which yields a relative URL — the frontend can
     * still resolve it against its current origin if both apps share
     * the same domain.
     */
    private function buildAvatarUrl(): ?string
    {
        if ($this->avatarPath === null || $this->avatarPath === '') {
            return null;
        }
        $base = rtrim((string) ($_ENV['APP_URL'] ?? ''), '/');
        $path = ltrim($this->avatarPath, '/');
        return $base . '/api/storage/' . $path;
    }
}
