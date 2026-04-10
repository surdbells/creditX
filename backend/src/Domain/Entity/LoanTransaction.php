<?php
declare(strict_types=1);
namespace App\Domain\Entity;

use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

#[ORM\Entity]
#[ORM\Table(name: 'loan_transactions')]
#[ORM\HasLifecycleCallbacks]
class LoanTransaction
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\OneToOne(targetEntity: Loan::class, inversedBy: 'transaction')]
    #[ORM\JoinColumn(name: 'loan_id', referencedColumnName: 'id', nullable: false)]
    private Loan $loan;

    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)] private string $appAmount = '0.00';
    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)] private string $grossLoan = '0.00';
    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)] private string $totalFees = '0.00';
    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)] private string $mrPrincipal = '0.00';
    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)] private string $mrInterest = '0.00';
    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)] private string $trPrincipal = '0.00';
    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)] private string $trInterest = '0.00';
    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)] private string $mrPrincipalInterest = '0.00';
    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)] private string $trPrincipalInterest = '0.00';
    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)] private string $netDisbursed = '0.00';
    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)] private string $topUpBalance = '0.00';
    #[ORM\Column(type: 'integer')] private int $loanTenure = 0;

    public function __construct() { $this->id = Uuid::uuid4()->toString(); }

    public function getId(): string { return $this->id; }
    public function getLoan(): Loan { return $this->loan; }
    public function setLoan(Loan $v): void { $this->loan = $v; }
    public function getAppAmount(): string { return $this->appAmount; }
    public function setAppAmount(string $v): void { $this->appAmount = $v; }
    public function getGrossLoan(): string { return $this->grossLoan; }
    public function setGrossLoan(string $v): void { $this->grossLoan = $v; }
    public function getTotalFees(): string { return $this->totalFees; }
    public function setTotalFees(string $v): void { $this->totalFees = $v; }
    public function getMrPrincipal(): string { return $this->mrPrincipal; }
    public function setMrPrincipal(string $v): void { $this->mrPrincipal = $v; }
    public function getMrInterest(): string { return $this->mrInterest; }
    public function setMrInterest(string $v): void { $this->mrInterest = $v; }
    public function getTrPrincipal(): string { return $this->trPrincipal; }
    public function setTrPrincipal(string $v): void { $this->trPrincipal = $v; }
    public function getTrInterest(): string { return $this->trInterest; }
    public function setTrInterest(string $v): void { $this->trInterest = $v; }
    public function getMrPrincipalInterest(): string { return $this->mrPrincipalInterest; }
    public function setMrPrincipalInterest(string $v): void { $this->mrPrincipalInterest = $v; }
    public function getTrPrincipalInterest(): string { return $this->trPrincipalInterest; }
    public function setTrPrincipalInterest(string $v): void { $this->trPrincipalInterest = $v; }
    public function getNetDisbursed(): string { return $this->netDisbursed; }
    public function setNetDisbursed(string $v): void { $this->netDisbursed = $v; }
    public function getTopUpBalance(): string { return $this->topUpBalance; }
    public function setTopUpBalance(string $v): void { $this->topUpBalance = $v; }
    public function getLoanTenure(): int { return $this->loanTenure; }
    public function setLoanTenure(int $v): void { $this->loanTenure = $v; }

    public function toArray(): array
    {
        return [
            'id' => $this->id, 'loan_id' => $this->loan->getId(),
            'app_amount' => $this->appAmount, 'gross_loan' => $this->grossLoan,
            'total_fees' => $this->totalFees,
            'mr_principal' => $this->mrPrincipal, 'mr_interest' => $this->mrInterest,
            'tr_principal' => $this->trPrincipal, 'tr_interest' => $this->trInterest,
            'mr_principal_interest' => $this->mrPrincipalInterest,
            'tr_principal_interest' => $this->trPrincipalInterest,
            'net_disbursed' => $this->netDisbursed, 'top_up_balance' => $this->topUpBalance,
            'loan_tenure' => $this->loanTenure,
            'created_at' => $this->createdAt->format('Y-m-d H:i:s'),
        ];
    }
}
