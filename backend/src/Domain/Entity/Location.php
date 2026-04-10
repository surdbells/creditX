<?php

declare(strict_types=1);

namespace App\Domain\Entity;

use App\Domain\Enum\LocationType;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

#[ORM\Entity(repositoryClass: \App\Domain\Repository\LocationRepository::class)]
#[ORM\Table(name: 'locations')]
#[ORM\UniqueConstraint(name: 'uniq_locations_code', columns: ['code'])]
#[ORM\HasLifecycleCallbacks]
class Location
{
    use TimestampsTrait;
    use SoftDeleteTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\Column(type: 'string', length: 150)]
    private string $name;

    #[ORM\Column(type: 'string', length: 20, unique: true)]
    private string $code;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $address = null;

    #[ORM\Column(type: 'string', length: 100, nullable: true)]
    private ?string $state = null;

    #[ORM\Column(type: 'string', length: 30, enumType: LocationType::class)]
    private LocationType $type;

    #[ORM\Column(type: 'boolean', options: ['default' => true])]
    private bool $isActive = true;

    /** @var Collection<int, User> */
    #[ORM\ManyToMany(targetEntity: User::class, mappedBy: 'locations')]
    private Collection $users;

    public function __construct()
    {
        $this->id = Uuid::uuid4()->toString();
        $this->type = LocationType::BRANCH;
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

    public function getCode(): string
    {
        return $this->code;
    }

    public function setCode(string $code): void
    {
        $this->code = strtoupper(trim($code));
    }

    public function getAddress(): ?string
    {
        return $this->address;
    }

    public function setAddress(?string $address): void
    {
        $this->address = $address;
    }

    public function getState(): ?string
    {
        return $this->state;
    }

    public function setState(?string $state): void
    {
        $this->state = $state;
    }

    public function getType(): LocationType
    {
        return $this->type;
    }

    public function setType(LocationType $type): void
    {
        $this->type = $type;
    }

    public function isActive(): bool
    {
        return $this->isActive;
    }

    public function setIsActive(bool $isActive): void
    {
        $this->isActive = $isActive;
    }

    /** @return Collection<int, User> */
    public function getUsers(): Collection
    {
        return $this->users;
    }

    public function toArray(): array
    {
        return [
            'id'         => $this->id,
            'name'       => $this->name,
            'code'       => $this->code,
            'address'    => $this->address,
            'state'      => $this->state,
            'type'       => $this->type->value,
            'is_active'  => $this->isActive,
            'created_at' => $this->createdAt->format('Y-m-d H:i:s'),
            'updated_at' => $this->updatedAt->format('Y-m-d H:i:s'),
        ];
    }
}
