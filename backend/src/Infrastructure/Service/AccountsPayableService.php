<?php
declare(strict_types=1);
namespace App\Infrastructure\Service;

use App\Domain\Entity\Bill;
use App\Domain\Entity\GeneralLedger;
use App\Domain\Entity\TaxRate;
use App\Domain\Entity\TaxTransaction;
use App\Domain\Entity\Vendor;
use App\Domain\Enum\JournalEntryType;
use App\Domain\Enum\TransactionType;
use App\Domain\Exception\DomainException;
use Doctrine\ORM\EntityManagerInterface;

/**
 * AccountsPayableService — vendors, bills, and AP postings.
 *
 *   Approve bill : DR <expense GL>           CR Accruals & Payables (ACCRPAY)
 *   Pay bill     : DR Accruals & Payables    CR <funding GL, default BANK>
 *
 * Aging buckets outstanding (approved / partially paid) bills by days past
 * the due date.
 */
final class AccountsPayableService
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly PeriodGuardService $periodGuard,
        private readonly LedgerService $ledgerService,
    ) {}

    public function createVendor(array $data): Vendor
    {
        $name = trim((string) ($data['name'] ?? ''));
        if ($name === '') throw new DomainException('Vendor name is required');
        $vendor = new Vendor();
        $vendor->setName($name);
        $vendor->setCode(trim((string) ($data['code'] ?? '')) ?: Vendor::generateCode());
        $vendor->setContactEmail($this->nullable($data['contact_email'] ?? null));
        $vendor->setContactPhone($this->nullable($data['contact_phone'] ?? null));
        $vendor->setBankAccount($this->nullable($data['bank_account'] ?? null));
        $vendor->setBankName($this->nullable($data['bank_name'] ?? null));
        $this->em->persist($vendor);
        $this->em->flush();
        return $vendor;
    }

    public function createBill(array $data, ?string $userId): Bill
    {
        $vendor = $this->em->find(Vendor::class, (string) ($data['vendor_id'] ?? ''));
        if ($vendor === null) throw new DomainException('Vendor not found');

        $amount = $this->money((string) ($data['amount'] ?? '0'));
        if (bccomp($amount, '0.00', 2) <= 0) throw new DomainException('Bill amount must be greater than zero');

        $billDate = (string) ($data['bill_date'] ?? date('Y-m-d'));
        $dueDate  = (string) ($data['due_date'] ?? $billDate);
        $this->assertDate($billDate);
        $this->assertDate($dueDate);

        $expenseCode = (string) ($data['expense_gl_code'] ?? 'GENADMIN');
        $this->gl($expenseCode); // validate it exists now, not at approval

        $bill = new Bill();
        $bill->setVendor($vendor);
        $bill->setBillNumber(trim((string) ($data['bill_number'] ?? '')) ?: 'BILL-' . strtoupper(bin2hex(random_bytes(3))));
        $bill->setBillDate(new \DateTimeImmutable($billDate));
        $bill->setDueDate(new \DateTimeImmutable($dueDate));
        $bill->setDescription($this->nullable($data['description'] ?? null));
        $bill->setExpenseGlCode($expenseCode);
        $bill->setAmount($amount);
        $bill->setCreatedBy($userId);
        $this->em->persist($bill);
        $this->em->flush();
        return $bill;
    }

    /** Approve a draft bill — accrue the expense. */
    public function approveBill(string $billId, ?string $userId): Bill
    {
        $bill = $this->bill($billId);
        if ($bill->getStatus() !== 'draft') throw new DomainException('Only draft bills can be approved');

        $postDate = $bill->getBillDate()->format('Y-m-d');
        $this->periodGuard->assertDateOpen($postDate);

        $expGl = $this->gl($bill->getExpenseGlCode());
        $apGl = $this->gl('ACCRPAY');

        $this->em->beginTransaction();
        try {
            $this->ledgerService->postJournal(
                entryType: JournalEntryType::MANUAL,
                postingDate: $postDate,
                narration: 'Bill approved — ' . $bill->getVendor()->getName() . ' #' . $bill->getBillNumber(),
                postedBy: $userId,
                lines: [
                    ['gl' => $expGl, 'type' => TransactionType::DR, 'amount' => $bill->getAmount(), 'narration' => 'Expense - ' . $bill->getBillNumber()],
                    ['gl' => $apGl, 'type' => TransactionType::CR, 'amount' => $bill->getAmount(), 'narration' => 'Payable - ' . $bill->getVendor()->getName()],
                ],
                legacyCallback: 'AP-BILL-' . $bill->getBillNumber() . '-' . date('YmdHis'),
                reference: $bill->getBillNumber(),
            );
            $bill->setStatus('approved');
            $this->em->flush();
            $this->em->commit();
            return $bill;
        } catch (\Throwable $e) {
            if ($this->em->getConnection()->isTransactionActive()) $this->em->rollback();
            throw $e;
        }
    }

    /**
     * Pay (or part-pay) an approved bill from a funding account.
     *
     * When $whtRateCode is given, withholding tax is deducted from the
     * vendor payment and raised as a Tax Payable liability:
     *   DR Accruals & Payables (amount settled)
     *   CR Bank                (net = amount − WHT)
     *   CR Tax Payable         (WHT)
     * The payable is discharged by the full $amount (WHT is paid to the
     * authority on the vendor's behalf). A WHT TaxTransaction is recorded so
     * it shows in the tax module and is tracked for remittance.
     */
    public function payBill(string $billId, string $amount, ?string $fundingGlCode, string $paymentDate, ?string $userId, ?string $whtRateCode = null): Bill
    {
        $bill = $this->bill($billId);
        if (!in_array($bill->getStatus(), ['approved', 'partially_paid'], true)) {
            throw new DomainException('Only approved or partially-paid bills can be paid');
        }
        $this->assertDate($paymentDate);
        $this->periodGuard->assertDateOpen($paymentDate);

        $amount = $this->money($amount);
        if (bccomp($amount, '0.00', 2) <= 0) throw new DomainException('Payment amount must be greater than zero');
        if (bccomp($amount, $bill->outstanding(), 2) > 0) throw new DomainException('Payment exceeds outstanding balance');

        // Resolve withholding tax (optional).
        $whtRate = '0.0000';
        $wht = '0.00';
        if ($whtRateCode !== null && $whtRateCode !== '') {
            $rate = $this->em->getRepository(TaxRate::class)->findOneBy(['code' => $whtRateCode]);
            if ($rate === null) throw new DomainException('WHT rate code not found');
            if (strtoupper($rate->getType()) !== 'WHT') throw new DomainException('Selected rate is not a WHT rate');
            $whtRate = $rate->getRate();
            $wht = $this->money(bcmul($amount, $whtRate, 4));
        }
        $net = bcsub($amount, $wht, 2);
        if (bccomp($net, '0.00', 2) <= 0) throw new DomainException('Withholding leaves no net payable to the vendor');

        $apGl = $this->gl('ACCRPAY');
        $fundGl = $this->gl($fundingGlCode !== null && $fundingGlCode !== '' ? $fundingGlCode : 'BANK');
        $callback = 'AP-PAY-' . $bill->getBillNumber() . '-' . date('YmdHis');

        $lines = [
            ['gl' => $apGl, 'type' => TransactionType::DR, 'amount' => $amount, 'narration' => 'Settle payable - ' . $bill->getBillNumber()],
            ['gl' => $fundGl, 'type' => TransactionType::CR, 'amount' => $net, 'narration' => 'Vendor payment - ' . $bill->getVendor()->getName()],
        ];
        if (bccomp($wht, '0.00', 2) > 0) {
            $lines[] = ['gl' => $this->gl('TAXPAY'), 'type' => TransactionType::CR, 'amount' => $wht, 'narration' => 'WHT withheld - ' . $bill->getBillNumber()];
        }

        $this->em->beginTransaction();
        try {
            $this->ledgerService->postJournal(
                entryType: JournalEntryType::MANUAL,
                postingDate: $paymentDate,
                narration: 'Bill payment — ' . $bill->getVendor()->getName() . ' #' . $bill->getBillNumber(),
                postedBy: $userId,
                lines: $lines,
                legacyCallback: $callback,
                reference: $bill->getBillNumber(),
            );

            // Record the WHT for the tax module (the journal above already
            // posted the CR Tax Payable — this row is the reporting record).
            if (bccomp($wht, '0.00', 2) > 0) {
                $t = new TaxTransaction();
                $t->setKind('WHT');
                $t->setBaseAmount($amount);
                $t->setRate($whtRate);
                $t->setTaxAmount($wht);
                $t->setParty($bill->getVendor()->getName());
                $t->setReference($bill->getBillNumber());
                $t->setTxnDate(new \DateTimeImmutable($paymentDate));
                $t->setPeriodYear(substr($paymentDate, 0, 4));
                $t->setPeriodMonth(substr($paymentDate, 5, 2));
                $t->setCallbackRef($callback);
                $t->setCreatedBy($userId);
                $this->em->persist($t);
            }

            $newPaid = bcadd($bill->getAmountPaid(), $amount, 2);
            $bill->setAmountPaid($newPaid);
            $bill->setStatus(bccomp($newPaid, $bill->getAmount(), 2) >= 0 ? 'paid' : 'partially_paid');
            $this->em->flush();
            $this->em->commit();
            return $bill;
        } catch (\Throwable $e) {
            if ($this->em->getConnection()->isTransactionActive()) $this->em->rollback();
            throw $e;
        }
    }

    /** AP aging: outstanding bills bucketed by days past due as of a date. */
    public function aging(string $asOf): array
    {
        $this->assertDate($asOf);
        $bills = $this->em->createQueryBuilder()
            ->select('b')->from(Bill::class, 'b')
            ->where('b.status IN (:s)')->setParameter('s', ['approved', 'partially_paid'])
            ->getQuery()->getResult();

        $buckets = ['current' => '0.00', '1_30' => '0.00', '31_60' => '0.00', '61_90' => '0.00', 'over_90' => '0.00'];
        $rows = [];
        $total = '0.00';
        $asOfDt = new \DateTimeImmutable($asOf);
        foreach ($bills as $b) {
            /** @var Bill $b */
            $out = $b->outstanding();
            if (bccomp($out, '0.00', 2) <= 0) continue;
            $days = (int) $asOfDt->diff($b->getDueDate())->days * ($b->getDueDate() <= $asOfDt ? 1 : -1);
            $bucket = $days <= 0 ? 'current' : ($days <= 30 ? '1_30' : ($days <= 60 ? '31_60' : ($days <= 90 ? '61_90' : 'over_90')));
            $buckets[$bucket] = bcadd($buckets[$bucket], $out, 2);
            $total = bcadd($total, $out, 2);
            $rows[] = $b->toArray() + ['days_past_due' => max(0, $days), 'bucket' => $bucket];
        }
        return ['as_of' => $asOf, 'buckets' => $buckets, 'total_outstanding' => $total, 'bills' => $rows];
    }

    // ─── internal ──────────────────────────────────────────────────

    private function bill(string $id): Bill
    {
        $b = $this->em->find(Bill::class, $id);
        if ($b === null) throw new DomainException('Bill not found');
        return $b;
    }

    private function gl(string $code): GeneralLedger
    {
        $gl = $this->em->getRepository(GeneralLedger::class)->findOneBy(['accountCode' => $code]);
        if ($gl === null) throw new DomainException("GL account '{$code}' not found");
        return $gl;
    }

    private function money(string $v): string { return number_format((float) $v, 2, '.', ''); }
    private function nullable($v): ?string { return $v !== null && $v !== '' ? (string) $v : null; }

    private function assertDate(string $d): void
    {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) throw new DomainException('Invalid date — expected YYYY-MM-DD');
    }
}
