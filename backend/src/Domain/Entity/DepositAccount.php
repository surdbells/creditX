<?php

declare(strict_types=1);

namespace App\Domain\Entity;

use App\Domain\Enum\DepositAccountStatus;
use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

/**
 * A customer's deposit account — the subsidiary ledger behind the
 * Customer Deposits (CUSTDEP) GL control account. Every deposit account
 * belongs to one customer and is opened against one DepositProduct, whose
 * rules (interest method, withdrawal policy, balance floors) govern it.
 *
 * The `balance` column is a denormalised running balance kept in step with
 * the GL inside the same DB transaction as each posting. The authoritative
 * figure is still the sum of this account's DepositTransaction legs / the
 * CUSTDEP GL movements; `balance` exists so listings and withdrawal-policy
 * checks don't have to re-aggregate the ledger on every call.
 */
#[ORM\Entity]
#[ORM\Table(name: 'deposit_accounts')]
#[ORM\UniqueConstraint(name: 'uniq_deposit_accounts_number', columns: ['account_number'])]
#[ORM\Index(name: 'idx_deposit_accounts_customer', columns: ['customer_id'])]
#[ORM\Index(name: 'idx_deposit_accounts_product', columns: ['product_id'])]
#[ORM\Index(name: 'idx_deposit_accounts_status', columns: ['status'])]
#[ORM\HasLifecycleCallbacks]
class DepositAccount
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\Column(type: 'string', length: 20, unique: true)]
    private string $accountNumber;

    #[ORM\ManyToOne(targetEntity: Customer::class)]
    #[ORM\JoinColumn(name: 'customer_id', referencedColumnName: 'id', nullable: false)]
    private Customer $customer;

    #[ORM\ManyToOne(targetEntity: DepositProduct::class)]
    #[ORM\JoinColumn(name: 'product_id', referencedColumnName: 'id', nullable: false)]
    private DepositProduct $product;

    /** Denormalised running balance; kept in lockstep with the GL per posting. */
    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)]
    private string $balance = '0.00';

    #[ORM\Column(type: 'string', length: 20, enumType: DepositAccountStatus::class)]
    private DepositAccountStatus $status = DepositAccountStatus::ACTIVE;

    #[ORM\Column(type: 'date_immutable')]
    private \DateTimeImmutable $openedDate;

    /** Last customer-initiated activity — drives dormancy detection. */
    #[ORM\Column(type: 'date_immutable', nullable: true)]
    private ?\DateTimeImmutable $lastActivityDate = null;

    #[ORM\Column(type: 'date_immutable', nullable: true)]
    private ?\DateTimeImmutable $closedDate = null;

    public function __construct()
    {
        $this->id = Uuid::uuid4()->toString();
        $this->openedDate = new \DateTimeImmutable('today');
    }

    public function getId(): string { return $this->id; }
    public function getAccountNumber(): string { return $this->accountNumber; }
    public function setAccountNumber(string $v): void { $this->accountNumber = $v; }
    public function getCustomer(): Customer { return $this->customer; }
    public function setCustomer(Customer $v): void { $this->customer = $v; }
    public function getProduct(): DepositProduct { return $this->product; }
    public function setProduct(DepositProduct $v): void { $this->product = $v; }
    public function getBalance(): string { return $this->balance; }
    public function setBalance(string $v): void { $this->balance = $v; }
    public function getStatus(): DepositAccountStatus { return $this->status; }
    public function setStatus(DepositAccountStatus $v): void { $this->status = $v; }
    public function getOpenedDate(): \DateTimeImmutable { return $this->openedDate; }
    public function setOpenedDate(\DateTimeImmutable $v): void { $this->openedDate = $v; }
    public function getLastActivityDate(): ?\DateTimeImmutable { return $this->lastActivityDate; }
    public function setLastActivityDate(?\DateTimeImmutable $v): void { $this->lastActivityDate = $v; }
    public function getClosedDate(): ?\DateTimeImmutable { return $this->closedDate; }
    public function setClosedDate(?\DateTimeImmutable $v): void { $this->closedDate = $v; }

    public function isTransactable(): bool { return $this->status === DepositAccountStatus::ACTIVE; }

    public static function generateAccountNumber(): string
    {
        return 'DA' . str_pad((string) random_int(1, 9999999999), 10, '0', STR_PAD_LEFT);
    }

    public function toArray(): array
    {
        return [
            'id'                 => $this->id,
            'account_number'     => $this->accountNumber,
            'customer_id'        => $this->customer->getId(),
            'customer_name'      => $this->customer->getFullName(),
            'product_id'         => $this->product->getId(),
            'product_name'       => $this->product->getName(),
            'product_code'       => $this->product->getCode(),
            'balance'            => $this->balance,
            'status'             => $this->status->value,
            'opened_date'        => $this->openedDate->format('Y-m-d'),
            'last_activity_date' => $this->lastActivityDate?->format('Y-m-d'),
            'closed_date'        => $this->closedDate?->format('Y-m-d'),
            'created_at'         => $this->createdAt->format('Y-m-d H:i:s'),
            'updated_at'         => $this->updatedAt->format('Y-m-d H:i:s'),
        ];
    }
}
