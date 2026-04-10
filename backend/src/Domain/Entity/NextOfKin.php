<?php

declare(strict_types=1);

namespace App\Domain\Entity;

use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

#[ORM\Entity]
#[ORM\Table(name: 'next_of_kins')]
#[ORM\HasLifecycleCallbacks]
class NextOfKin
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\ManyToOne(targetEntity: Customer::class, inversedBy: 'nextOfKins')]
    #[ORM\JoinColumn(name: 'customer_id', referencedColumnName: 'id', nullable: false, onDelete: 'CASCADE')]
    private Customer $customer;

    #[ORM\Column(type: 'string', length: 200)]
    private string $fullName;

    #[ORM\Column(type: 'string', length: 30, nullable: true)]
    private ?string $phone = null;

    #[ORM\Column(type: 'string', length: 500, nullable: true)]
    private ?string $address = null;

    #[ORM\Column(type: 'string', length: 50, nullable: true)]
    private ?string $relationship = null;

    #[ORM\Column(type: 'boolean', options: ['default' => false])]
    private bool $isPrimary = false;

    public function __construct()
    {
        $this->id = Uuid::uuid4()->toString();
    }

    public function getId(): string { return $this->id; }
    public function getCustomer(): Customer { return $this->customer; }
    public function setCustomer(Customer $customer): void { $this->customer = $customer; }
    public function getFullName(): string { return $this->fullName; }
    public function setFullName(string $v): void { $this->fullName = trim($v); }
    public function getPhone(): ?string { return $this->phone; }
    public function setPhone(?string $v): void { $this->phone = $v; }
    public function getAddress(): ?string { return $this->address; }
    public function setAddress(?string $v): void { $this->address = $v; }
    public function getRelationship(): ?string { return $this->relationship; }
    public function setRelationship(?string $v): void { $this->relationship = $v; }
    public function isPrimary(): bool { return $this->isPrimary; }
    public function setIsPrimary(bool $v): void { $this->isPrimary = $v; }

    public function toArray(): array
    {
        return [
            'id'           => $this->id,
            'customer_id'  => $this->customer->getId(),
            'full_name'    => $this->fullName,
            'phone'        => $this->phone,
            'address'      => $this->address,
            'relationship' => $this->relationship,
            'is_primary'   => $this->isPrimary,
            'created_at'   => $this->createdAt->format('Y-m-d H:i:s'),
        ];
    }
}
