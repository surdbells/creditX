<?php
declare(strict_types=1);
namespace App\Domain\Entity;

use App\Domain\Enum\SettlementStatus;
use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

/**
 * A single outbound bank transfer that settles a disbursed loan — i.e. the
 * actual money movement to the customer's account via a payment provider
 * (Paystack or Flutterwave). Distinct from the disbursement, which is the
 * GL/accounting entry. One loan may have several settlement rows over time
 * if earlier attempts FAIL and are retried, but only one ACTIVE
 * (pending/processing/success) row at a time.
 */
#[ORM\Entity]
#[ORM\Table(name: 'settlements')]
#[ORM\Index(name: 'idx_settlement_loan', columns: ['loan_id'])]
#[ORM\Index(name: 'idx_settlement_status', columns: ['status'])]
#[ORM\Index(name: 'idx_settlement_provider_ref', columns: ['provider', 'provider_reference'])]
#[ORM\HasLifecycleCallbacks]
class Settlement
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

    /** 'paystack' | 'flutterwave' */
    #[ORM\Column(type: 'string', length: 20)]
    private string $provider;

    /** Amount transferred, stored as a decimal string (matches Loan). */
    #[ORM\Column(type: 'decimal', precision: 18, scale: 2)]
    private string $amount;

    #[ORM\Column(name: 'bank_code', type: 'string', length: 20)]
    private string $bankCode;

    #[ORM\Column(name: 'account_number', type: 'string', length: 20)]
    private string $accountNumber;

    #[ORM\Column(name: 'account_name', type: 'string', length: 200, nullable: true)]
    private ?string $accountName = null;

    #[ORM\Column(type: 'string', length: 20, enumType: SettlementStatus::class)]
    private SettlementStatus $status = SettlementStatus::PENDING;

    /** Provider transfer identifier (Paystack transfer_code, Flutterwave id). */
    #[ORM\Column(name: 'provider_reference', type: 'string', length: 100, nullable: true)]
    private ?string $providerReference = null;

    /** Paystack transfer recipient code (recipient must exist before transfer). */
    #[ORM\Column(name: 'provider_recipient', type: 'string', length: 100, nullable: true)]
    private ?string $providerRecipient = null;

    /**
     * Idempotency key sent to the provider so a retried initiate never
     * creates two real transfers. Also our internal dedupe handle.
     */
    #[ORM\Column(name: 'idempotency_key', type: 'string', length: 64, unique: true)]
    private string $idempotencyKey;

    #[ORM\Column(name: 'failure_reason', type: 'text', nullable: true)]
    private ?string $failureReason = null;

    /** Raw provider response for the last transition (audit/debug). */
    #[ORM\Column(name: 'provider_response', type: 'json', nullable: true)]
    private ?array $providerResponse = null;

    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(name: 'initiated_by', referencedColumnName: 'id', nullable: true)]
    private ?User $initiatedBy = null;

    #[ORM\Column(name: 'settled_at', type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $settledAt = null;

    public function __construct()
    {
        $this->id = Uuid::uuid4()->toString();
        $this->idempotencyKey = Uuid::uuid4()->toString();
    }

    public function getId(): string { return $this->id; }

    public function getLoan(): Loan { return $this->loan; }
    public function setLoan(Loan $v): void { $this->loan = $v; }

    public function getCustomer(): Customer { return $this->customer; }
    public function setCustomer(Customer $v): void { $this->customer = $v; }

    public function getProvider(): string { return $this->provider; }
    public function setProvider(string $v): void { $this->provider = $v; }

    public function getAmount(): string { return $this->amount; }
    public function setAmount(string $v): void { $this->amount = $v; }

    public function getBankCode(): string { return $this->bankCode; }
    public function setBankCode(string $v): void { $this->bankCode = $v; }

    public function getAccountNumber(): string { return $this->accountNumber; }
    public function setAccountNumber(string $v): void { $this->accountNumber = $v; }

    public function getAccountName(): ?string { return $this->accountName; }
    public function setAccountName(?string $v): void { $this->accountName = $v; }

    public function getStatus(): SettlementStatus { return $this->status; }
    public function setStatus(SettlementStatus $v): void { $this->status = $v; }

    public function getProviderReference(): ?string { return $this->providerReference; }
    public function setProviderReference(?string $v): void { $this->providerReference = $v; }

    public function getProviderRecipient(): ?string { return $this->providerRecipient; }
    public function setProviderRecipient(?string $v): void { $this->providerRecipient = $v; }

    public function getIdempotencyKey(): string { return $this->idempotencyKey; }

    public function getFailureReason(): ?string { return $this->failureReason; }
    public function setFailureReason(?string $v): void { $this->failureReason = $v; }

    public function getProviderResponse(): ?array { return $this->providerResponse; }
    public function setProviderResponse(?array $v): void { $this->providerResponse = $v; }

    public function getInitiatedBy(): ?User { return $this->initiatedBy; }
    public function setInitiatedBy(?User $v): void { $this->initiatedBy = $v; }

    public function getSettledAt(): ?\DateTimeImmutable { return $this->settledAt; }
    public function setSettledAt(?\DateTimeImmutable $v): void { $this->settledAt = $v; }

    public function toArray(): array
    {
        return [
            'id'                 => $this->id,
            'loan_id'            => $this->loan->getId(),
            'application_id'     => $this->loan->getApplicationId(),
            'customer_id'        => $this->customer->getId(),
            'customer_name'      => $this->customer->getFullName(),
            'provider'           => $this->provider,
            'amount'             => $this->amount,
            'bank_code'          => $this->bankCode,
            'account_number'     => $this->accountNumber,
            'account_name'       => $this->accountName,
            'status'             => $this->status->value,
            'provider_reference' => $this->providerReference,
            'failure_reason'     => $this->failureReason,
            'initiated_by'       => $this->initiatedBy?->getFullName(),
            'settled_at'         => $this->settledAt?->format('Y-m-d H:i:s'),
            'created_at'         => $this->createdAt->format('Y-m-d H:i:s'),
        ];
    }
}
