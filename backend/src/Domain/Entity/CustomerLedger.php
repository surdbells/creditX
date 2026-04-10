<?php
declare(strict_types=1);
namespace App\Domain\Entity;

use App\Domain\Enum\CustomerLedgerStatus;
use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

#[ORM\Entity(repositoryClass: \App\Domain\Repository\CustomerLedgerRepository::class)]
#[ORM\Table(name: 'customer_ledgers')]
#[ORM\UniqueConstraint(name: 'uniq_cl_account_number', columns: ['account_number'])]
#[ORM\Index(name: 'idx_cl_customer', columns: ['customer_id'])]
#[ORM\Index(name: 'idx_cl_loan', columns: ['loan_id'])]
#[ORM\HasLifecycleCallbacks]
class CustomerLedger
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\ManyToOne(targetEntity: Customer::class)]
    #[ORM\JoinColumn(name: 'customer_id', referencedColumnName: 'id', nullable: false)]
    private Customer $customer;

    #[ORM\ManyToOne(targetEntity: Loan::class)]
    #[ORM\JoinColumn(name: 'loan_id', referencedColumnName: 'id', nullable: false)]
    private Loan $loan;

    #[ORM\ManyToOne(targetEntity: GeneralLedger::class)]
    #[ORM\JoinColumn(name: 'gl_id', referencedColumnName: 'id', nullable: false)]
    private GeneralLedger $generalLedger;

    #[ORM\Column(type: 'string', length: 20, unique: true)]
    private string $accountNumber;

    #[ORM\Column(type: 'string', length: 20, enumType: CustomerLedgerStatus::class)]
    private CustomerLedgerStatus $status = CustomerLedgerStatus::ACTIVE;

    public function __construct()
    {
        $this->id = Uuid::uuid4()->toString();
    }

    public function getId(): string { return $this->id; }
    public function getCustomer(): Customer { return $this->customer; }
    public function setCustomer(Customer $v): void { $this->customer = $v; }
    public function getLoan(): Loan { return $this->loan; }
    public function setLoan(Loan $v): void { $this->loan = $v; }
    public function getGeneralLedger(): GeneralLedger { return $this->generalLedger; }
    public function setGeneralLedger(GeneralLedger $v): void { $this->generalLedger = $v; }
    public function getAccountNumber(): string { return $this->accountNumber; }
    public function setAccountNumber(string $v): void { $this->accountNumber = $v; }
    public function getStatus(): CustomerLedgerStatus { return $this->status; }
    public function setStatus(CustomerLedgerStatus $v): void { $this->status = $v; }

    public function close(): void { $this->status = CustomerLedgerStatus::CLOSED; }
    public function freeze(): void { $this->status = CustomerLedgerStatus::FROZEN; }

    public static function generateAccountNumber(): string
    {
        return 'CL' . str_pad((string) random_int(1, 9999999999), 10, '0', STR_PAD_LEFT);
    }

    public function toArray(): array
    {
        return [
            'id'              => $this->id,
            'customer_id'     => $this->customer->getId(),
            'customer_name'   => $this->customer->getFullName(),
            'loan_id'         => $this->loan->getId(),
            'loan_app_id'     => $this->loan->getApplicationId(),
            'gl_id'           => $this->generalLedger->getId(),
            'gl_name'         => $this->generalLedger->getAccountName(),
            'account_number'  => $this->accountNumber,
            'status'          => $this->status->value,
            'created_at'      => $this->createdAt->format('Y-m-d H:i:s'),
        ];
    }
}
