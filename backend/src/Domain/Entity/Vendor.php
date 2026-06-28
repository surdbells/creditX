<?php
declare(strict_types=1);
namespace App\Domain\Entity;

use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

/**
 * Vendor — a supplier/payee for accounts-payable bills.
 */
#[ORM\Entity]
#[ORM\Table(name: 'vendors')]
#[ORM\Index(name: 'idx_vendor_active', columns: ['is_active'])]
#[ORM\HasLifecycleCallbacks]
class Vendor
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\Column(type: 'string', length: 150)]
    private string $name;

    #[ORM\Column(type: 'string', length: 40, unique: true)]
    private string $code;

    #[ORM\Column(name: 'contact_email', type: 'string', length: 150, nullable: true)]
    private ?string $contactEmail = null;

    #[ORM\Column(name: 'contact_phone', type: 'string', length: 40, nullable: true)]
    private ?string $contactPhone = null;

    #[ORM\Column(name: 'bank_account', type: 'string', length: 60, nullable: true)]
    private ?string $bankAccount = null;

    #[ORM\Column(name: 'bank_name', type: 'string', length: 120, nullable: true)]
    private ?string $bankName = null;

    #[ORM\Column(name: 'is_active', type: 'boolean', options: ['default' => true])]
    private bool $isActive = true;

    public function __construct() { $this->id = Uuid::uuid4()->toString(); }

    public static function generateCode(): string
    {
        return 'VEND-' . strtoupper(bin2hex(random_bytes(3)));
    }

    public function getId(): string { return $this->id; }
    public function getName(): string { return $this->name; }
    public function setName(string $v): void { $this->name = $v; }
    public function getCode(): string { return $this->code; }
    public function setCode(string $v): void { $this->code = $v; }
    public function getContactEmail(): ?string { return $this->contactEmail; }
    public function setContactEmail(?string $v): void { $this->contactEmail = $v; }
    public function getContactPhone(): ?string { return $this->contactPhone; }
    public function setContactPhone(?string $v): void { $this->contactPhone = $v; }
    public function getBankAccount(): ?string { return $this->bankAccount; }
    public function setBankAccount(?string $v): void { $this->bankAccount = $v; }
    public function getBankName(): ?string { return $this->bankName; }
    public function setBankName(?string $v): void { $this->bankName = $v; }
    public function isActive(): bool { return $this->isActive; }
    public function setIsActive(bool $v): void { $this->isActive = $v; }

    public function toArray(): array
    {
        return [
            'id'            => $this->id,
            'name'          => $this->name,
            'code'          => $this->code,
            'contact_email' => $this->contactEmail,
            'contact_phone' => $this->contactPhone,
            'bank_account'  => $this->bankAccount,
            'bank_name'     => $this->bankName,
            'is_active'     => $this->isActive,
            'created_at'    => $this->createdAt->format('Y-m-d H:i:s'),
        ];
    }
}
