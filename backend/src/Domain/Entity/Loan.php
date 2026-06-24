<?php

declare(strict_types=1);

namespace App\Domain\Entity;

use App\Domain\Enum\InterestMethod;
use App\Domain\Enum\LoanStatus;
use App\Domain\Enum\LoanType;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

#[ORM\Entity]
#[ORM\Table(name: 'loans')]
#[ORM\Index(name: 'idx_loans_status', columns: ['status'])]
#[ORM\Index(name: 'idx_loans_customer', columns: ['customer_id'])]
#[ORM\Index(name: 'idx_loans_product', columns: ['product_id'])]
#[ORM\Index(name: 'idx_loans_agent', columns: ['agent_id'])]
#[ORM\Index(name: 'idx_loans_branch', columns: ['branch_id'])]
#[ORM\HasLifecycleCallbacks]
class Loan
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    /** Human-readable application ID (e.g., LN-2026-00001) */
    #[ORM\Column(type: 'string', length: 30, unique: true)]
    private string $applicationId;

    #[ORM\ManyToOne(targetEntity: Customer::class)]
    #[ORM\JoinColumn(name: 'customer_id', referencedColumnName: 'id', nullable: false)]
    private Customer $customer;

    #[ORM\ManyToOne(targetEntity: LoanProduct::class)]
    #[ORM\JoinColumn(name: 'product_id', referencedColumnName: 'id', nullable: false)]
    private LoanProduct $product;

    #[ORM\ManyToOne(targetEntity: Location::class)]
    #[ORM\JoinColumn(name: 'branch_id', referencedColumnName: 'id', nullable: true)]
    private ?Location $branch = null;

    /** The agent (DSA) who captured this loan */
    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(name: 'agent_id', referencedColumnName: 'id', nullable: true)]
    private ?User $agent = null;

    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)]
    private string $amountRequested;

    #[ORM\Column(type: 'integer')]
    private int $tenure;

    #[ORM\Column(type: 'decimal', precision: 15, scale: 2, nullable: true)]
    private ?string $grossLoan = null;

    #[ORM\Column(type: 'decimal', precision: 15, scale: 2, nullable: true)]
    private ?string $netDisbursed = null;

    #[ORM\Column(type: 'decimal', precision: 8, scale: 6)]
    private string $interestRate;

    #[ORM\Column(type: 'string', length: 30, enumType: InterestMethod::class)]
    private InterestMethod $calculationMethod;

    #[ORM\Column(type: 'string', length: 20, enumType: LoanStatus::class)]
    private LoanStatus $status = LoanStatus::DRAFT;

    #[ORM\Column(type: 'string', length: 10, enumType: LoanType::class)]
    private LoanType $loanType = LoanType::NEW_LOAN;

    #[ORM\Column(type: 'string', length: 30, nullable: true)]
    private ?string $bankStatementMode = null;

    #[ORM\Column(type: 'decimal', precision: 15, scale: 2, nullable: true)]
    private ?string $topUpBalance = null;

    /**
     * Top-up override set during underwriter approval.
     *
     * The application-time $topUpBalance is captured by the agent at
     * the point of capture — often an estimate or based on the
     * customer's self-reported balance. The underwriter is the
     * authoritative reviewer: during their approval step they can
     * look at the actual outstanding on the previous loan and fix
     * the number.
     *
     * When this field is set, DisbursementService uses it instead of
     * $topUpBalance and the disbursement form locks the field in the
     * UI so operators can't accidentally revert to the captured
     * value. Null means "underwriter has not adjusted" — fall back to
     * $topUpBalance as before.
     */
    #[ORM\Column(type: 'decimal', precision: 15, scale: 2, nullable: true)]
    private ?string $topUpBalanceUnderwriter = null;

    /** Reference to previous loan (for top-ups) */
    #[ORM\Column(type: 'string', length: 36, nullable: true)]
    private ?string $previousLoanId = null;

    // ─── Application-capture fields — populated by the agent during
    //     the loan wizard. Not directly used by the calculation engine;
    //     persisted for audit, statement generation, and disbursement. ───

    /**
     * Loan amount in words — free-text field matching the legacy
     * "Amount in word" input, e.g. "Five hundred thousand naira only".
     * Used in printed loan agreements.
     */
    #[ORM\Column(type: 'string', length: 500, nullable: true)]
    private ?string $loanAmountWords = null;

    /**
     * Purpose of the loan — legacy default was "Public Sector".
     * Free text; not an enum so products can define their own
     * typical purposes without schema changes.
     */
    #[ORM\Column(type: 'string', length: 200, nullable: true)]
    private ?string $loanPurpose = null;

    /**
     * Repayment method. Legacy values are "Direct Debit", "Cheques",
     * "Payroll Deduction". Left as free-text rather than enum for the
     * same flexibility as loanPurpose.
     */
    #[ORM\Column(type: 'string', length: 50, nullable: true)]
    private ?string $repaymentMethod = null;

    /**
     * Account statement identifier. Applies when the customer provided
     * their own statement — an identifier for the uploaded document.
     */
    #[ORM\Column(type: 'string', length: 100, nullable: true)]
    private ?string $accountStatementId = null;

    /**
     * Password for opening the account statement PDF. Stored as-is for
     * now; the statement-consumer service needs the plaintext to
     * open the PDF. A future hardening could encrypt this with a
     * per-tenant key so it's not readable from raw DB access.
     */
    #[ORM\Column(type: 'string', length: 100, nullable: true)]
    private ?string $accountStatementPassword = null;

    // ─── Affordability snapshot — captured at application time on the
    //     self-service portal. Frozen here (rather than read live off the
    //     customer) so the figure a reviewer sees is the one the applicant
    //     was assessed on, even if the customer later edits their income.
    //     Null for agent/government-captured loans. ───

    /** Applicant's self-declared monthly income at the time of application. */
    #[ORM\Column(type: 'decimal', precision: 15, scale: 2, nullable: true)]
    private ?string $applicantMonthlyIncome = null;

    /** Debt-service ratio (monthly instalment / monthly income) at application time. */
    #[ORM\Column(type: 'decimal', precision: 8, scale: 6, nullable: true)]
    private ?string $dsr = null;

    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $disbursedAt = null;

    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $closedAt = null;

    /** @var Collection<int, LoanFeeBreakdown> */
    #[ORM\OneToMany(targetEntity: LoanFeeBreakdown::class, mappedBy: 'loan', cascade: ['persist', 'remove'], orphanRemoval: true)]
    private Collection $feeBreakdowns;

    /** @var Collection<int, LoanTrail> */
    #[ORM\OneToMany(targetEntity: LoanTrail::class, mappedBy: 'loan', cascade: ['persist'], orphanRemoval: true)]
    #[ORM\OrderBy(['createdAt' => 'DESC'])]
    private Collection $trails;

    #[ORM\OneToOne(targetEntity: LoanTransaction::class, mappedBy: 'loan', cascade: ['persist', 'remove'])]
    private ?LoanTransaction $transaction = null;

    public function __construct()
    {
        $this->id = Uuid::uuid4()->toString();
        $this->feeBreakdowns = new ArrayCollection();
        $this->trails = new ArrayCollection();
    }

    // ─── Getters ───
    public function getId(): string { return $this->id; }
    public function getApplicationId(): string { return $this->applicationId; }
    public function getCustomer(): Customer { return $this->customer; }
    public function getProduct(): LoanProduct { return $this->product; }
    public function getBranch(): ?Location { return $this->branch; }
    public function getAgent(): ?User { return $this->agent; }
    public function getAmountRequested(): string { return $this->amountRequested; }
    public function getTenure(): int { return $this->tenure; }
    public function getGrossLoan(): ?string { return $this->grossLoan; }
    public function getNetDisbursed(): ?string { return $this->netDisbursed; }
    public function getInterestRate(): string { return $this->interestRate; }
    public function getCalculationMethod(): InterestMethod { return $this->calculationMethod; }
    public function getStatus(): LoanStatus { return $this->status; }
    public function getLoanType(): LoanType { return $this->loanType; }
    public function getBankStatementMode(): ?string { return $this->bankStatementMode; }
    public function getTopUpBalance(): ?string { return $this->topUpBalance; }
    public function getTopUpBalanceUnderwriter(): ?string { return $this->topUpBalanceUnderwriter; }

    /**
     * The authoritative top-up balance for disbursement.
     *
     * If the underwriter set a value during review, that wins. Otherwise
     * fall back to the application-time capture. Callers should use
     * this resolver rather than reading either raw field, so the
     * lookup rule lives in one place.
     */
    public function getEffectiveTopUpBalance(): ?string
    {
        return $this->topUpBalanceUnderwriter ?? $this->topUpBalance;
    }

    /** True when an underwriter has explicitly set the top-up balance.
     *  The disbursement UI uses this to decide whether to lock the field. */
    public function isTopUpLockedByUnderwriter(): bool
    {
        return $this->topUpBalanceUnderwriter !== null;
    }

    public function getPreviousLoanId(): ?string { return $this->previousLoanId; }
    public function getApplicantMonthlyIncome(): ?string { return $this->applicantMonthlyIncome; }
    public function getDsr(): ?string { return $this->dsr; }
    public function getDisbursedAt(): ?\DateTimeImmutable { return $this->disbursedAt; }
    public function getLoanAmountWords(): ?string { return $this->loanAmountWords; }
    public function getLoanPurpose(): ?string { return $this->loanPurpose; }
    public function getRepaymentMethod(): ?string { return $this->repaymentMethod; }
    public function getAccountStatementId(): ?string { return $this->accountStatementId; }
    public function getAccountStatementPassword(): ?string { return $this->accountStatementPassword; }
    public function getClosedAt(): ?\DateTimeImmutable { return $this->closedAt; }
    public function getTransaction(): ?LoanTransaction { return $this->transaction; }
    /** @return Collection<int, LoanFeeBreakdown> */
    public function getFeeBreakdowns(): Collection { return $this->feeBreakdowns; }
    /** @return Collection<int, LoanTrail> */
    public function getTrails(): Collection { return $this->trails; }

    // ─── Setters ───
    public function setApplicationId(string $v): void { $this->applicationId = $v; }
    public function setCustomer(Customer $v): void { $this->customer = $v; }
    public function setProduct(LoanProduct $v): void { $this->product = $v; }
    public function setBranch(?Location $v): void { $this->branch = $v; }
    public function setAgent(?User $v): void { $this->agent = $v; }
    public function setAmountRequested(string $v): void { $this->amountRequested = $v; }
    public function setTenure(int $v): void { $this->tenure = max(1, $v); }
    public function setGrossLoan(?string $v): void { $this->grossLoan = $v; }
    public function setNetDisbursed(?string $v): void { $this->netDisbursed = $v; }
    public function setInterestRate(string $v): void { $this->interestRate = $v; }
    public function setCalculationMethod(InterestMethod $v): void { $this->calculationMethod = $v; }
    public function setLoanType(LoanType $v): void { $this->loanType = $v; }
    public function setBankStatementMode(?string $v): void { $this->bankStatementMode = $v; }
    public function setTopUpBalance(?string $v): void { $this->topUpBalance = $v; }
    public function setTopUpBalanceUnderwriter(?string $v): void { $this->topUpBalanceUnderwriter = $v; }
    public function setPreviousLoanId(?string $v): void { $this->previousLoanId = $v; }
    public function setApplicantMonthlyIncome(?string $v): void { $this->applicantMonthlyIncome = $v; }
    public function setDsr(?string $v): void { $this->dsr = $v; }
    public function setDisbursedAt(?\DateTimeImmutable $v): void { $this->disbursedAt = $v; }
    public function setLoanAmountWords(?string $v): void { $this->loanAmountWords = $v; }
    public function setLoanPurpose(?string $v): void { $this->loanPurpose = $v; }
    public function setRepaymentMethod(?string $v): void { $this->repaymentMethod = $v; }
    public function setAccountStatementId(?string $v): void { $this->accountStatementId = $v; }
    public function setAccountStatementPassword(?string $v): void { $this->accountStatementPassword = $v; }
    public function setClosedAt(?\DateTimeImmutable $v): void { $this->closedAt = $v; }
    public function setTransaction(?LoanTransaction $v): void { $this->transaction = $v; }

    // ─── State machine ───

    /**
     * Transition to a new status with validation.
     * @throws \App\Domain\Exception\DomainException
     */
    public function transitionTo(LoanStatus $newStatus): void
    {
        if (!$this->status->canTransitionTo($newStatus)) {
            throw new \App\Domain\Exception\DomainException(
                "Cannot transition loan from {$this->status->value} to {$newStatus->value}"
            );
        }
        $this->status = $newStatus;
    }

    public function setStatus(LoanStatus $v): void { $this->status = $v; }

    // ─── Fee management ───

    public function addFeeBreakdown(LoanFeeBreakdown $fee): void
    {
        $fee->setLoan($this);
        $this->feeBreakdowns->add($fee);
    }

    public function clearFeeBreakdowns(): void
    {
        $this->feeBreakdowns->clear();
    }

    // ─── Trail ───

    public function addTrail(LoanTrail $trail): void
    {
        $trail->setLoan($this);
        $this->trails->add($trail);
    }

    // ─── Application ID generator ───

    public static function generateApplicationId(): string
    {
        $year = date('Y');
        $random = str_pad((string) random_int(1, 99999), 5, '0', STR_PAD_LEFT);
        return "LN-{$year}-{$random}";
    }

    // ─── Serialization ───

    public function toArray(bool $includeRelations = false): array
    {
        $data = [
            'id'                 => $this->id,
            'application_id'     => $this->applicationId,
            'customer_id'        => $this->customer->getId(),
            'customer_name'      => $this->customer->getFullName(),
            'customer_staff_id'  => $this->customer->getStaffId(),
            'product_id'         => $this->product->getId(),
            'product_name'       => $this->product->getName(),
            'product_code'       => $this->product->getCode(),
            'branch_id'          => $this->branch?->getId(),
            'branch_name'        => $this->branch?->getName(),
            'agent_id'           => $this->agent?->getId(),
            'agent_name'         => $this->agent?->getFullName(),
            'amount_requested'   => $this->amountRequested,
            'tenure'             => $this->tenure,
            'gross_loan'         => $this->grossLoan,
            'net_disbursed'      => $this->netDisbursed,
            'interest_rate'      => $this->interestRate,
            'calculation_method' => $this->calculationMethod->value,
            'status'             => $this->status->value,
            'loan_type'          => $this->loanType->value,
            'bank_statement_mode' => $this->bankStatementMode,
            'top_up_balance'                  => $this->topUpBalance,
            'top_up_balance_underwriter'      => $this->topUpBalanceUnderwriter,
            'top_up_balance_effective'        => $this->getEffectiveTopUpBalance(),
            'top_up_locked_by_underwriter'    => $this->isTopUpLockedByUnderwriter(),
            'previous_loan_id'   => $this->previousLoanId,
            'applicant_monthly_income' => $this->applicantMonthlyIncome,
            'dsr'                => $this->dsr,
            'disbursed_at'       => $this->disbursedAt?->format('Y-m-d H:i:s'),
            'loan_amount_words'  => $this->loanAmountWords,
            'loan_purpose'       => $this->loanPurpose,
            'repayment_method'   => $this->repaymentMethod,
            'account_statement_id' => $this->accountStatementId,
            // Intentionally NOT included: account_statement_password.
            // Never returned in API responses. Readable via getter only.
            'closed_at'          => $this->closedAt?->format('Y-m-d H:i:s'),
            'created_at'         => $this->createdAt->format('Y-m-d H:i:s'),
            'updated_at'         => $this->updatedAt->format('Y-m-d H:i:s'),
        ];

        if ($includeRelations) {
            $data['transaction'] = $this->transaction?->toArray();
            $data['fee_breakdowns'] = $this->feeBreakdowns->map(fn(LoanFeeBreakdown $f) => $f->toArray())->toArray();
            $data['trails'] = $this->trails->map(fn(LoanTrail $t) => $t->toArray())->toArray();
            // Full customer object with all 36+ fields — consumed by the
            // agent edit-loan wizard to pre-populate Step 3. The existing
            // flattened customer_id / customer_name / customer_staff_id
            // fields above are kept for backward compatibility (loan list
            // renders, approval queue, etc. rely on them).
            $data['customer'] = $this->customer->toArray();
            // Next-of-kin array — the agent wizard captures one NOK in
            // Step 3, but the customer may have multiple NOKs from earlier
            // loans. We return them all; the edit wizard renders the
            // first one editable and indicates if there are more.
            $data['next_of_kin'] = $this->customer->getNextOfKins()->map(
                fn(NextOfKin $n) => $n->toArray()
            )->toArray();
        }

        return $data;
    }
}
