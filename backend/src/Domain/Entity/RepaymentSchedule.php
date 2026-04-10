<?php
declare(strict_types=1);
namespace App\Domain\Entity;

use App\Domain\Enum\RepaymentStatus;
use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

#[ORM\Entity(repositoryClass: \App\Domain\Repository\RepaymentScheduleRepository::class)]
#[ORM\Table(name: 'repayment_schedules')]
#[ORM\Index(name: 'idx_rs_loan', columns: ['loan_id'])]
#[ORM\Index(name: 'idx_rs_due_date', columns: ['due_date'])]
#[ORM\Index(name: 'idx_rs_status', columns: ['status'])]
#[ORM\HasLifecycleCallbacks]
class RepaymentSchedule
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\ManyToOne(targetEntity: Loan::class)]
    #[ORM\JoinColumn(name: 'loan_id', referencedColumnName: 'id', nullable: false)]
    private Loan $loan;

    #[ORM\ManyToOne(targetEntity: CustomerLedger::class)]
    #[ORM\JoinColumn(name: 'ledger_id', referencedColumnName: 'id', nullable: true)]
    private ?CustomerLedger $ledger = null;

    #[ORM\Column(type: 'integer')]
    private int $installmentNumber;

    #[ORM\Column(type: 'date')]
    private \DateTimeInterface $dueDate;

    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)]
    private string $principalAmount;

    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)]
    private string $interestAmount;

    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)]
    private string $totalAmount;

    #[ORM\Column(type: 'decimal', precision: 15, scale: 2, options: ['default' => '0.00'])]
    private string $paidAmount = '0.00';

    #[ORM\Column(type: 'string', length: 20, enumType: RepaymentStatus::class)]
    private RepaymentStatus $status = RepaymentStatus::PENDING;

    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $paidAt = null;

    public function __construct() { $this->id = Uuid::uuid4()->toString(); }

    public function getId(): string { return $this->id; }
    public function getLoan(): Loan { return $this->loan; }
    public function setLoan(Loan $v): void { $this->loan = $v; }
    public function getLedger(): ?CustomerLedger { return $this->ledger; }
    public function setLedger(?CustomerLedger $v): void { $this->ledger = $v; }
    public function getInstallmentNumber(): int { return $this->installmentNumber; }
    public function setInstallmentNumber(int $v): void { $this->installmentNumber = $v; }
    public function getDueDate(): \DateTimeInterface { return $this->dueDate; }
    public function setDueDate(\DateTimeInterface $v): void { $this->dueDate = $v; }
    public function getPrincipalAmount(): string { return $this->principalAmount; }
    public function setPrincipalAmount(string $v): void { $this->principalAmount = $v; }
    public function getInterestAmount(): string { return $this->interestAmount; }
    public function setInterestAmount(string $v): void { $this->interestAmount = $v; }
    public function getTotalAmount(): string { return $this->totalAmount; }
    public function setTotalAmount(string $v): void { $this->totalAmount = $v; }
    public function getPaidAmount(): string { return $this->paidAmount; }
    public function setPaidAmount(string $v): void { $this->paidAmount = $v; }
    public function getStatus(): RepaymentStatus { return $this->status; }
    public function setStatus(RepaymentStatus $v): void { $this->status = $v; }
    public function getPaidAt(): ?\DateTimeImmutable { return $this->paidAt; }
    public function setPaidAt(?\DateTimeImmutable $v): void { $this->paidAt = $v; }

    public function getOutstanding(): string { return bcsub($this->totalAmount, $this->paidAmount, 2); }

    public function markPaid(string $amount): void
    {
        $this->paidAmount = bcadd($this->paidAmount, $amount, 2);
        $outstanding = $this->getOutstanding();
        if (bccomp($outstanding, '0.00', 2) <= 0) {
            $this->status = RepaymentStatus::PAID;
            $this->paidAt = new \DateTimeImmutable('now', new \DateTimeZone($_ENV['APP_TIMEZONE'] ?? 'Africa/Lagos'));
        } else {
            $this->status = RepaymentStatus::PARTIAL;
        }
    }

    public function toArray(): array
    {
        return [
            'id' => $this->id, 'loan_id' => $this->loan->getId(),
            'ledger_id' => $this->ledger?->getId(), 'installment_number' => $this->installmentNumber,
            'due_date' => $this->dueDate->format('Y-m-d'),
            'principal_amount' => $this->principalAmount, 'interest_amount' => $this->interestAmount,
            'total_amount' => $this->totalAmount, 'paid_amount' => $this->paidAmount,
            'outstanding' => $this->getOutstanding(), 'status' => $this->status->value,
            'paid_at' => $this->paidAt?->format('Y-m-d H:i:s'), 'created_at' => $this->createdAt->format('Y-m-d H:i:s'),
        ];
    }
}
