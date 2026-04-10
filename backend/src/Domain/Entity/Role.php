<?php

declare(strict_types=1);

namespace App\Domain\Entity;

use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

#[ORM\Entity(repositoryClass: \App\Domain\Repository\RoleRepository::class)]
#[ORM\Table(name: 'roles')]
#[ORM\UniqueConstraint(name: 'uniq_roles_slug', columns: ['slug'])]
#[ORM\HasLifecycleCallbacks]
class Role
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\Column(type: 'string', length: 100)]
    private string $name;

    #[ORM\Column(type: 'string', length: 100, unique: true)]
    private string $slug;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $description = null;

    #[ORM\Column(type: 'boolean', options: ['default' => false])]
    private bool $isSystem = false;

    #[ORM\Column(type: 'boolean', options: ['default' => true])]
    private bool $isActive = true;

    /** @var Collection<int, Permission> */
    #[ORM\ManyToMany(targetEntity: Permission::class, inversedBy: 'roles')]
    #[ORM\JoinTable(name: 'role_permissions')]
    #[ORM\JoinColumn(name: 'role_id', referencedColumnName: 'id')]
    #[ORM\InverseJoinColumn(name: 'permission_id', referencedColumnName: 'id')]
    private Collection $permissions;

    /** @var Collection<int, User> */
    #[ORM\ManyToMany(targetEntity: User::class, mappedBy: 'roles')]
    private Collection $users;

    public function __construct()
    {
        $this->id = Uuid::uuid4()->toString();
        $this->permissions = new ArrayCollection();
        $this->users = new ArrayCollection();
    }

    public function getId(): string
    {
        return $this->id;
    }

    public function getName(): string
    {
        return $this->name;
    }

    public function setName(string $name): void
    {
        $this->name = trim($name);
    }

    public function getSlug(): string
    {
        return $this->slug;
    }

    public function setSlug(string $slug): void
    {
        $this->slug = strtolower(trim($slug));
    }

    public function getDescription(): ?string
    {
        return $this->description;
    }

    public function setDescription(?string $description): void
    {
        $this->description = $description;
    }

    public function isSystem(): bool
    {
        return $this->isSystem;
    }

    public function setIsSystem(bool $isSystem): void
    {
        $this->isSystem = $isSystem;
    }

    public function isActive(): bool
    {
        return $this->isActive;
    }

    public function setIsActive(bool $isActive): void
    {
        $this->isActive = $isActive;
    }

    /** @return Collection<int, Permission> */
    public function getPermissions(): Collection
    {
        return $this->permissions;
    }

    public function addPermission(Permission $permission): void
    {
        if (!$this->permissions->contains($permission)) {
            $this->permissions->add($permission);
        }
    }

    public function removePermission(Permission $permission): void
    {
        $this->permissions->removeElement($permission);
    }

    public function clearPermissions(): void
    {
        $this->permissions->clear();
    }

    public function hasPermission(string $slug): bool
    {
        return $this->permissions->exists(fn(int $i, Permission $p) => $p->getSlug() === $slug);
    }

    /** @return Collection<int, User> */
    public function getUsers(): Collection
    {
        return $this->users;
    }

    public function toArray(bool $includePermissions = false): array
    {
        $data = [
            'id'          => $this->id,
            'name'        => $this->name,
            'slug'        => $this->slug,
            'description' => $this->description,
            'is_system'   => $this->isSystem,
            'is_active'   => $this->isActive,
            'created_at'  => $this->createdAt->format('Y-m-d H:i:s'),
        ];

        if ($includePermissions) {
            $data['permissions'] = $this->permissions->map(fn(Permission $p) => $p->toArray())->toArray();
        }

        return $data;
    }
}
