<?php
declare(strict_types=1);
namespace App\Domain\Entity;

use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

/**
 * A single credit-bureau enquiry and its normalized result.
 *
 * Covers both entry points: a standalone check from the Credit Bureau module
 * (loan null) and an automated check run at a workflow credit-check step
 * (loan set). Stores the numeric score, risk band, a small summary and the
 * full raw provider report for audit.
 */
#[ORM\Entity]
#[ORM\Table(name: 'credit_checks')]
#[ORM\Index(name: 'idx_credit_checks_loan', columns: ['loan_id'])]
#[ORM\Index(name: 'idx_credit_checks_customer', columns: ['customer_id'])]
#[ORM\Index(name: 'idx_credit_checks_created', columns: ['created_at'])]
#[ORM\HasLifecycleCallbacks]
class CreditCheck
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\ManyToOne(targetEntity: Customer::class)]
    #[ORM\JoinColumn(name: 'customer_id', referencedColumnName: 'id', nullable: true)]
    private ?Customer $customer = null;

    #[ORM\ManyToOne(targetEntity: Loan::class)]
    #[ORM\JoinColumn(name: 'loan_id', referencedColumnName: 'id', nullable: true)]
    private ?Loan $loan = null;

    #[ORM\Column(type: 'string', length: 20)]
    private string $provider = 'firstcentral';

    /** 'consumer' | 'commercial' */
    #[ORM\Column(name: 'subject_type', type: 'string', length: 20)]
    private string $subjectType = 'consumer';

    /** What was searched (BVN, business name or RC number) — for the audit trail. */
    #[ORM\Column(type: 'string', length: 200, nullable: true)]
    private ?string $identifier = null;

    /** hit | no_hit | error | not_configured */
    #[ORM\Column(type: 'string', length: 20)]
    private string $status;

    #[ORM\Column(type: 'integer', nullable: true)]
    private ?int $score = null;

    #[ORM\Column(name: 'risk_band', type: 'string', length: 60, nullable: true)]
    private ?string $riskBand = null;

    /** null | auto_pass | auto_fail | manual (how a workflow step used this result). */
    #[ORM\Column(type: 'string', length: 20, nullable: true)]
    private ?string $decision = null;

    #[ORM\Column(name: 'provider_ref', type: 'string', length: 60, nullable: true)]
    private ?string $providerRef = null;

    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $summary = null;

    /** Full raw provider report (JSON) for audit / re-display. */
    #[ORM\Column(name: 'raw_response', type: 'json', nullable: true)]
    private ?array $rawResponse = null;

    #[ORM\Column(name: 'error_message', type: 'text', nullable: true)]
    private ?string $errorMessage = null;

    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(name: 'initiated_by', referencedColumnName: 'id', nullable: true)]
    private ?User $initiatedBy = null;

    public function __construct() { $this->id = Uuid::uuid4()->toString(); }

    public function getId(): string { return $this->id; }

    public function getCustomer(): ?Customer { return $this->customer; }
    public function setCustomer(?Customer $v): void { $this->customer = $v; }

    public function getLoan(): ?Loan { return $this->loan; }
    public function setLoan(?Loan $v): void { $this->loan = $v; }

    public function getProvider(): string { return $this->provider; }
    public function setProvider(string $v): void { $this->provider = $v; }

    public function getSubjectType(): string { return $this->subjectType; }
    public function setSubjectType(string $v): void { $this->subjectType = $v; }

    public function getIdentifier(): ?string { return $this->identifier; }
    public function setIdentifier(?string $v): void { $this->identifier = $v; }

    public function getStatus(): string { return $this->status; }
    public function setStatus(string $v): void { $this->status = $v; }

    public function getScore(): ?int { return $this->score; }
    public function setScore(?int $v): void { $this->score = $v; }

    public function getRiskBand(): ?string { return $this->riskBand; }
    public function setRiskBand(?string $v): void { $this->riskBand = $v; }

    public function getDecision(): ?string { return $this->decision; }
    public function setDecision(?string $v): void { $this->decision = $v; }

    public function getProviderRef(): ?string { return $this->providerRef; }
    public function setProviderRef(?string $v): void { $this->providerRef = $v; }

    public function getSummary(): ?array { return $this->summary; }
    public function setSummary(?array $v): void { $this->summary = $v; }

    public function getRawResponse(): ?array { return $this->rawResponse; }
    public function setRawResponse(?array $v): void { $this->rawResponse = $v; }

    public function getErrorMessage(): ?string { return $this->errorMessage; }
    public function setErrorMessage(?string $v): void { $this->errorMessage = $v; }

    public function getInitiatedBy(): ?User { return $this->initiatedBy; }
    public function setInitiatedBy(?User $v): void { $this->initiatedBy = $v; }

    /** @param bool $includeRaw include the full provider report (heavy). */
    public function toArray(bool $includeRaw = false): array
    {
        $data = [
            'id'            => $this->id,
            'customer_id'   => $this->customer?->getId(),
            'customer_name' => $this->customer?->getFullName(),
            'loan_id'       => $this->loan?->getId(),
            'application_id'=> $this->loan?->getApplicationId(),
            'provider'      => $this->provider,
            'subject_type'  => $this->subjectType,
            'identifier'    => $this->identifier,
            'status'        => $this->status,
            'score'         => $this->score,
            'risk_band'     => $this->riskBand,
            'decision'      => $this->decision,
            'provider_ref'  => $this->providerRef,
            'summary'       => $this->summary,
            'error_message' => $this->errorMessage,
            'initiated_by'  => $this->initiatedBy?->getFullName(),
            'created_at'    => $this->createdAt->format('Y-m-d H:i:s'),
        ];
        if ($includeRaw) {
            $data['raw_response'] = $this->rawResponse;
        }
        return $data;
    }
}
