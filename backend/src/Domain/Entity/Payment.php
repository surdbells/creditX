<?php
declare(strict_types=1);
namespace App\Domain\Entity;

use App\Domain\Enum\PaymentChannel;
use App\Domain\Enum\PaymentStatus;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

#[ORM\Entity(repositoryClass: \App\Domain\Repository\PaymentRepository::class)]
#[ORM\Table(name: 'payments')]
#[ORM\Index(name: 'idx_payments_loan', columns: ['loan_id'])]
#[ORM\Index(name: 'idx_payments_customer', columns: ['customer_id'])]
#[ORM\Index(name: 'idx_payments_status', columns: ['status'])]
#[ORM\Index(name: 'idx_payments_reference', columns: ['reference'])]
#[ORM\HasLifecycleCallbacks]
class Payment
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\ManyToOne(targetEntity: Loan::class)]
    #[ORM\JoinColumn(name: 'loan_id', referencedColumnName: 'id', nullable: false)]
    private Loan $loan;

    #[ORM\ManyToOne(targetEntity: Customer::class)]
    #[ORM\JoinColumn(name: 'customer_id', referencedColumnName: 'id', nullable: false)]
    private Customer $customer;

    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)]
    private string $amount;

    #[ORM\Column(type: 'string', length: 20, enumType: PaymentChannel::class)]
    private PaymentChannel $channel;

    #[ORM\Column(type: 'string', length: 50, unique: true)]
    private string $reference;

    #[ORM\Column(type: 'string', length: 100, nullable: true)]
    private ?string $gatewayReference = null;

    #[ORM\Column(type: 'string', length: 20, enumType: PaymentStatus::class)]
    private PaymentStatus $status = PaymentStatus::PENDING;

    #[ORM\Column(type: 'decimal', precision: 15, scale: 2, options: ['default' => '0.00'])]
    private string $allocatedPrincipal = '0.00';

    #[ORM\Column(type: 'decimal', precision: 15, scale: 2, options: ['default' => '0.00'])]
    private string $allocatedInterest = '0.00';

    #[ORM\Column(type: 'decimal', precision: 15, scale: 2, options: ['default' => '0.00'])]
    private string $allocatedPenalty = '0.00';

    #[ORM\Column(type: 'date')]
    private \DateTimeInterface $paymentDate;

    #[ORM\Column(type: 'string', length: 36, nullable: true)]
    private ?string $verifiedBy = null;

    /** @var Collection<int, PaymentAllocation> */
    #[ORM\OneToMany(targetEntity: PaymentAllocation::class, mappedBy: 'payment', cascade: ['persist', 'remove'])]
    private Collection $allocations;

    public function __construct()
    {
        $this->id = Uuid::uuid4()->toString();
        $this->paymentDate = new \DateTime();
        $this->allocations = new ArrayCollection();
    }

    public function getId(): string { return $this->id; }
    public function getLoan(): Loan { return $this->loan; }
    public function setLoan(Loan $v): void { $this->loan = $v; }
    public function getCustomer(): Customer { return $this->customer; }
    public function setCustomer(Customer $v): void { $this->customer = $v; }
    public function getAmount(): string { return $this->amount; }
    public function setAmount(string $v): void { $this->amount = $v; }
    public function getChannel(): PaymentChannel { return $this->channel; }
    public function setChannel(PaymentChannel $v): void { $this->channel = $v; }
    public function getReference(): string { return $this->reference; }
    public function setReference(string $v): void { $this->reference = $v; }
    public function getGatewayReference(): ?string { return $this->gatewayReference; }
    public function setGatewayReference(?string $v): void { $this->gatewayReference = $v; }
    public function getStatus(): PaymentStatus { return $this->status; }
    public function setStatus(PaymentStatus $v): void { $this->status = $v; }
    public function getAllocatedPrincipal(): string { return $this->allocatedPrincipal; }
    public function setAllocatedPrincipal(string $v): void { $this->allocatedPrincipal = $v; }
    public function getAllocatedInterest(): string { return $this->allocatedInterest; }
    public function setAllocatedInterest(string $v): void { $this->allocatedInterest = $v; }
    public function getAllocatedPenalty(): string { return $this->allocatedPenalty; }
    public function setAllocatedPenalty(string $v): void { $this->allocatedPenalty = $v; }
    public function getPaymentDate(): \DateTimeInterface { return $this->paymentDate; }
    public function setPaymentDate(\DateTimeInterface $v): void { $this->paymentDate = $v; }
    public function getVerifiedBy(): ?string { return $this->verifiedBy; }
    public function setVerifiedBy(?string $v): void { $this->verifiedBy = $v; }
    /** @return Collection<int, PaymentAllocation> */
    public function getAllocations(): Collection { return $this->allocations; }

    public function addAllocation(PaymentAllocation $a): void { $a->setPayment($this); $this->allocations->add($a); }

    public static function generateReference(): string
    {
        return 'PAY-' . date('Ymd') . '-' . strtoupper(bin2hex(random_bytes(4)));
    }

    public function toArray(): array
    {
        return [
            'id' => $this->id, 'loan_id' => $this->loan->getId(),
            'loan_app_id' => $this->loan->getApplicationId(),
            'customer_id' => $this->customer->getId(), 'customer_name' => $this->customer->getFullName(),
            'amount' => $this->amount, 'channel' => $this->channel->value,
            'reference' => $this->reference, 'gateway_reference' => $this->gatewayReference,
            'status' => $this->status->value,
            'allocated_principal' => $this->allocatedPrincipal, 'allocated_interest' => $this->allocatedInterest,
            'allocated_penalty' => $this->allocatedPenalty,
            'payment_date' => $this->paymentDate->format('Y-m-d'),
            'verified_by' => $this->verifiedBy,
            'allocations' => $this->allocations->map(fn(PaymentAllocation $a) => $a->toArray())->toArray(),
            'created_at' => $this->createdAt->format('Y-m-d H:i:s'),
        ];
    }
}
