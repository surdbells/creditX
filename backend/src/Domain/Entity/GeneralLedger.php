<?php

declare(strict_types=1);

namespace App\Domain\Entity;

use App\Domain\Enum\AccountType;
use App\Domain\Enum\LedgerType;
use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

#[ORM\Entity(repositoryClass: \App\Domain\Repository\GeneralLedgerRepository::class)]
#[ORM\Table(name: 'general_ledgers')]
#[ORM\UniqueConstraint(name: 'uniq_gl_account_number', columns: ['account_number'])]
#[ORM\UniqueConstraint(name: 'uniq_gl_account_code', columns: ['account_code'])]
#[ORM\HasLifecycleCallbacks]
class GeneralLedger
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\Column(type: 'string', length: 200)]
    private string $accountName;

    #[ORM\Column(type: 'string', length: 20, unique: true)]
    private string $accountNumber;

    #[ORM\Column(type: 'string', length: 20, unique: true)]
    private string $accountCode;

    #[ORM\Column(type: 'string', length: 20, enumType: AccountType::class)]
    private AccountType $accountType;

    #[ORM\Column(type: 'string', length: 20, enumType: LedgerType::class)]
    private LedgerType $ledgerType = LedgerType::GENERAL;

    /** Self-referential parent for hierarchical chart of accounts */
    #[ORM\ManyToOne(targetEntity: GeneralLedger::class)]
    #[ORM\JoinColumn(name: 'parent_id', referencedColumnName: 'id', nullable: true)]
    private ?GeneralLedger $parent = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $description = null;

    #[ORM\Column(type: 'boolean', options: ['default' => true])]
    private bool $isActive = true;

    public function __construct()
    {
        $this->id = Uuid::uuid4()->toString();
    }

    public function getId(): string { return $this->id; }
    public function getAccountName(): string { return $this->accountName; }
    public function setAccountName(string $v): void { $this->accountName = trim($v); }
    public function getAccountNumber(): string { return $this->accountNumber; }
    public function setAccountNumber(string $v): void { $this->accountNumber = trim($v); }
    public function getAccountCode(): string { return $this->accountCode; }
    public function setAccountCode(string $v): void { $this->accountCode = strtoupper(trim($v)); }
    public function getAccountType(): AccountType { return $this->accountType; }
    public function setAccountType(AccountType $v): void { $this->accountType = $v; }
    public function getLedgerType(): LedgerType { return $this->ledgerType; }
    public function setLedgerType(LedgerType $v): void { $this->ledgerType = $v; }
    public function getParent(): ?GeneralLedger { return $this->parent; }
    public function setParent(?GeneralLedger $v): void { $this->parent = $v; }
    public function getDescription(): ?string { return $this->description; }
    public function setDescription(?string $v): void { $this->description = $v; }
    public function isActive(): bool { return $this->isActive; }
    public function setIsActive(bool $v): void { $this->isActive = $v; }

    public function toArray(): array
    {
        return [
            'id'              => $this->id,
            'account_name'    => $this->accountName,
            'account_number'  => $this->accountNumber,
            'account_code'    => $this->accountCode,
            'account_type'    => $this->accountType->value,
            'ledger_type'     => $this->ledgerType->value,
            'parent_id'       => $this->parent?->getId(),
            'parent_name'     => $this->parent?->getAccountName(),
            'description'     => $this->description,
            'is_active'       => $this->isActive,
            'created_at'      => $this->createdAt->format('Y-m-d H:i:s'),
            'updated_at'      => $this->updatedAt->format('Y-m-d H:i:s'),
        ];
    }
}
