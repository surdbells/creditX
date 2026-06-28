<?php
declare(strict_types=1);
namespace App\Domain\Entity;

use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

/**
 * InterestAccrualLine — per-loan snapshot from one interest accrual run.
 *
 * Captures the interest recognised (or suspended) for a single loan in the
 * run's period, plus the classification that decided income-vs-suspense and
 * the customer ledger the receivable was tagged to (so RepaymentService can
 * later clear exactly this loan's accrued interest).
 */
#[ORM\Entity]
#[ORM\Table(name: 'interest_accrual_lines')]
#[ORM\Index(name: 'idx_accrual_line_loan', columns: ['loan_id'])]
#[ORM\HasLifecycleCallbacks]
class InterestAccrualLine
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\ManyToOne(targetEntity: InterestAccrualRun::class, inversedBy: 'lines')]
    #[ORM\JoinColumn(name: 'run_id', referencedColumnName: 'id', nullable: false)]
    private InterestAccrualRun $run;

    #[ORM\ManyToOne(targetEntity: Loan::class)]
    #[ORM\JoinColumn(name: 'loan_id', referencedColumnName: 'id', nullable: false)]
    private Loan $loan;

    #[ORM\Column(type: 'string', length: 30)]
    private string $applicationIdSnapshot;

    /** Interest accrued for this loan in the period. */
    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)]
    private string $interestAccrued = '0.00';

    /** True = suspended (loan non-performing); credited to INTSUSP not income. */
    #[ORM\Column(type: 'boolean')]
    private bool $suspended = false;

    /** 'performing' | 'substandard' | 'doubtful' | 'lost' */
    #[ORM\Column(type: 'string', length: 20)]
    private string $classification = 'performing';

    #[ORM\Column(type: 'integer')]
    private int $daysOverdueSnapshot = 0;

    /** Customer ledger the receivable was tagged to (for repayment clearing). */
    #[ORM\Column(type: 'string', length: 36, nullable: true)]
    private ?string $customerLedgerId = null;

    public function __construct() { $this->id = Uuid::uuid4()->toString(); }

    public function getId(): string { return $this->id; }
    public function getRun(): InterestAccrualRun { return $this->run; }
    public function setRun(InterestAccrualRun $v): void { $this->run = $v; }
    public function getLoan(): Loan { return $this->loan; }
    public function setLoan(Loan $v): void { $this->loan = $v; }
    public function getApplicationIdSnapshot(): string { return $this->applicationIdSnapshot; }
    public function setApplicationIdSnapshot(string $v): void { $this->applicationIdSnapshot = $v; }
    public function getInterestAccrued(): string { return $this->interestAccrued; }
    public function setInterestAccrued(string $v): void { $this->interestAccrued = $v; }
    public function isSuspended(): bool { return $this->suspended; }
    public function setSuspended(bool $v): void { $this->suspended = $v; }
    public function getClassification(): string { return $this->classification; }
    public function setClassification(string $v): void { $this->classification = $v; }
    public function getDaysOverdueSnapshot(): int { return $this->daysOverdueSnapshot; }
    public function setDaysOverdueSnapshot(int $v): void { $this->daysOverdueSnapshot = $v; }
    public function getCustomerLedgerId(): ?string { return $this->customerLedgerId; }
    public function setCustomerLedgerId(?string $v): void { $this->customerLedgerId = $v; }

    public function toArray(): array
    {
        return [
            'id'                => $this->id,
            'run_id'            => $this->run->getId(),
            'loan_id'           => $this->loan->getId(),
            'application_id'    => $this->applicationIdSnapshot,
            'interest_accrued'  => $this->interestAccrued,
            'suspended'         => $this->suspended,
            'classification'    => $this->classification,
            'days_overdue'      => $this->daysOverdueSnapshot,
            'customer_ledger_id'=> $this->customerLedgerId,
        ];
    }
}
