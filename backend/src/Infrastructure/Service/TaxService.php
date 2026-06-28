<?php
declare(strict_types=1);
namespace App\Infrastructure\Service;

use App\Domain\Entity\GeneralLedger;
use App\Domain\Entity\TaxRate;
use App\Domain\Entity\TaxTransaction;
use App\Domain\Enum\JournalEntryType;
use App\Domain\Enum\TransactionType;
use App\Domain\Exception\DomainException;
use Doctrine\ORM\EntityManagerInterface;

/**
 * TaxService — configurable VAT/WHT rates, tax-liability accrual, and
 * remittance against the Tax Payable (TAXPAY) account.
 *
 *   Raise output VAT / WHT (tax owed): DR <counterpart>   CR TAXPAY
 *   Raise recoverable input VAT:       DR TAXPAY           CR <counterpart>
 *   Remit to authority:                DR TAXPAY           CR <funding, BANK>
 *
 * Tax = base × rate. Rates are stored as decimal fractions (0.075 = 7.5%).
 */
final class TaxService
{
    private const OWED_KINDS = ['VAT_OUTPUT', 'WHT'];
    private const RECLAIM_KINDS = ['VAT_INPUT'];

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly PeriodGuardService $periodGuard,
        private readonly LedgerService $ledgerService,
    ) {}

    /** @return TaxRate[] */
    public function listRates(): array
    {
        return $this->em->getRepository(TaxRate::class)->findBy([], ['type' => 'ASC', 'name' => 'ASC']);
    }

    public function createRate(array $data): TaxRate
    {
        $type = strtoupper((string) ($data['type'] ?? ''));
        if (!in_array($type, ['VAT', 'WHT'], true)) throw new DomainException('Tax type must be VAT or WHT');
        $rate = $this->money4((string) ($data['rate'] ?? '0'));
        if (bccomp($rate, '0.0000', 4) < 0) throw new DomainException('Rate must be >= 0');

        $r = new TaxRate();
        $r->setCode(trim((string) ($data['code'] ?? '')) ?: strtoupper($type . '-' . bin2hex(random_bytes(2))));
        $r->setName(trim((string) ($data['name'] ?? '')) ?: $type . ' rate');
        $r->setType($type);
        $r->setRate($rate);
        $r->setDescription(isset($data['description']) && $data['description'] !== '' ? (string) $data['description'] : null);
        $this->em->persist($r);
        $this->em->flush();
        return $r;
    }

    /**
     * Record (compute + post) a tax liability or reclaim.
     *
     * data: { kind, base_amount, rate_code|rate, counterpart_gl_code,
     *         party?, reference?, txn_date? }
     */
    public function record(array $data, ?string $userId): TaxTransaction
    {
        $kind = strtoupper((string) ($data['kind'] ?? ''));
        if (!in_array($kind, array_merge(self::OWED_KINDS, self::RECLAIM_KINDS), true)) {
            throw new DomainException('kind must be VAT_OUTPUT, VAT_INPUT or WHT');
        }
        $base = $this->money((string) ($data['base_amount'] ?? '0'));
        if (bccomp($base, '0.00', 2) <= 0) throw new DomainException('base_amount must be greater than zero');

        $rate = $this->resolveRate($data);
        $tax = $this->money(bcmul($base, $rate, 4));
        if (bccomp($tax, '0.00', 2) <= 0) throw new DomainException('Computed tax is zero — check base and rate');

        $txnDate = (string) ($data['txn_date'] ?? date('Y-m-d'));
        $this->assertDate($txnDate);
        $this->periodGuard->assertDateOpen($txnDate);

        $taxGl = $this->gl('TAXPAY');
        $counterpart = $this->gl((string) ($data['counterpart_gl_code'] ?? 'GENADMIN'));

        $owed = in_array($kind, self::OWED_KINDS, true);
        // Owed: DR counterpart / CR TAXPAY. Reclaim: DR TAXPAY / CR counterpart.
        $lines = $owed
            ? [
                ['gl' => $counterpart, 'type' => TransactionType::DR, 'amount' => $tax, 'narration' => "{$kind} base " . $base],
                ['gl' => $taxGl, 'type' => TransactionType::CR, 'amount' => $tax, 'narration' => "{$kind} payable"],
              ]
            : [
                ['gl' => $taxGl, 'type' => TransactionType::DR, 'amount' => $tax, 'narration' => "{$kind} recoverable"],
                ['gl' => $counterpart, 'type' => TransactionType::CR, 'amount' => $tax, 'narration' => "{$kind} base " . $base],
              ];

        $callback = 'TAX-' . $kind . '-' . date('YmdHis') . '-' . bin2hex(random_bytes(2));

        $this->em->beginTransaction();
        try {
            $this->ledgerService->postJournal(
                entryType: JournalEntryType::MANUAL,
                postingDate: $txnDate,
                narration: "Tax {$kind} — " . ($data['party'] ?? 'general'),
                postedBy: $userId,
                lines: $lines,
                legacyCallback: $callback,
                reference: isset($data['reference']) ? (string) $data['reference'] : null,
            );

            $t = new TaxTransaction();
            $t->setKind($kind);
            $t->setBaseAmount($base);
            $t->setRate($rate);
            $t->setTaxAmount($tax);
            $t->setParty(isset($data['party']) && $data['party'] !== '' ? (string) $data['party'] : null);
            $t->setReference(isset($data['reference']) && $data['reference'] !== '' ? (string) $data['reference'] : null);
            $t->setTxnDate(new \DateTimeImmutable($txnDate));
            $t->setPeriodYear(substr($txnDate, 0, 4));
            $t->setPeriodMonth(substr($txnDate, 5, 2));
            $t->setCallbackRef($callback);
            $t->setCreatedBy($userId);
            $this->em->persist($t);

            $this->em->flush();
            $this->em->commit();
            return $t;
        } catch (\Throwable $e) {
            if ($this->em->getConnection()->isTransactionActive()) $this->em->rollback();
            throw $e;
        }
    }

    /** Remit accrued tax to the authority: DR TAXPAY / CR funding. */
    public function remit(string $amount, ?string $fundingGlCode, string $remitDate, ?string $userId): array
    {
        $this->assertDate($remitDate);
        $this->periodGuard->assertDateOpen($remitDate);
        $amount = $this->money($amount);
        if (bccomp($amount, '0.00', 2) <= 0) throw new DomainException('Remittance amount must be greater than zero');

        $taxGl = $this->gl('TAXPAY');
        $fundGl = $this->gl($fundingGlCode !== null && $fundingGlCode !== '' ? $fundingGlCode : 'BANK');
        $callback = 'TAX-REMIT-' . date('YmdHis');

        $this->em->beginTransaction();
        try {
            $this->ledgerService->postJournal(
                entryType: JournalEntryType::MANUAL,
                postingDate: $remitDate,
                narration: 'Tax remittance to authority',
                postedBy: $userId,
                lines: [
                    ['gl' => $taxGl, 'type' => TransactionType::DR, 'amount' => $amount, 'narration' => 'Tax remitted'],
                    ['gl' => $fundGl, 'type' => TransactionType::CR, 'amount' => $amount, 'narration' => 'Tax payment'],
                ],
                legacyCallback: $callback,
            );
            $this->em->flush();
            $this->em->commit();
            return ['amount' => $amount, 'remit_date' => $remitDate, 'callback' => $callback];
        } catch (\Throwable $e) {
            if ($this->em->getConnection()->isTransactionActive()) $this->em->rollback();
            throw $e;
        }
    }

    /** Tax summary for a period (or all), by kind, plus current TAXPAY balance. */
    public function report(?string $year, ?string $month): array
    {
        $qb = $this->em->createQueryBuilder()
            ->select('t.kind AS kind', 'SUM(t.taxAmount) AS total', 'COUNT(t.id) AS cnt')
            ->from(TaxTransaction::class, 't')
            ->groupBy('t.kind');
        if ($year) $qb->andWhere('t.periodYear = :y')->setParameter('y', $year);
        if ($month) $qb->andWhere('t.periodMonth = :m')->setParameter('m', str_pad($month, 2, '0', STR_PAD_LEFT));
        $rows = $qb->getQuery()->getResult();

        $byKind = ['VAT_OUTPUT' => '0.00', 'VAT_INPUT' => '0.00', 'WHT' => '0.00'];
        foreach ($rows as $r) {
            $byKind[$r['kind']] = $this->money((string) $r['total']);
        }
        $netPayable = bcsub(bcadd($byKind['VAT_OUTPUT'], $byKind['WHT'], 2), $byKind['VAT_INPUT'], 2);

        // Current TAXPAY liability balance (CR − DR).
        $taxGl = $this->gl('TAXPAY');
        $bal = $this->em->getConnection()->executeQuery(
            "SELECT COALESCE(SUM(CASE WHEN trans_type='CR' THEN CAST(trans_amount AS NUMERIC) ELSE 0 END),0)
                  - COALESCE(SUM(CASE WHEN trans_type='DR' THEN CAST(trans_amount AS NUMERIC) ELSE 0 END),0) AS bal
             FROM ledger_transactions WHERE gl_id = :g",
            ['g' => $taxGl->getId()]
        )->fetchOne();

        return [
            'period'         => $year ? ($year . ($month ? '-' . str_pad($month, 2, '0', STR_PAD_LEFT) : '')) : 'all',
            'by_kind'        => $byKind,
            'net_payable'    => $netPayable,
            'taxpay_balance' => $this->money((string) $bal),
        ];
    }

    /** @return TaxTransaction[] */
    public function listTransactions(?string $year, ?string $month, int $limit): array
    {
        $qb = $this->em->createQueryBuilder()->select('t')->from(TaxTransaction::class, 't')
            ->orderBy('t.txnDate', 'DESC')->addOrderBy('t.createdAt', 'DESC')->setMaxResults($limit);
        if ($year) $qb->andWhere('t.periodYear = :y')->setParameter('y', $year);
        if ($month) $qb->andWhere('t.periodMonth = :m')->setParameter('m', str_pad($month, 2, '0', STR_PAD_LEFT));
        return $qb->getQuery()->getResult();
    }

    // ─── internal ──────────────────────────────────────────────────

    private function resolveRate(array $data): string
    {
        if (isset($data['rate_code']) && $data['rate_code'] !== '') {
            $rate = $this->em->getRepository(TaxRate::class)->findOneBy(['code' => (string) $data['rate_code']]);
            if ($rate === null) throw new DomainException('Tax rate code not found');
            return $rate->getRate();
        }
        if (isset($data['rate']) && is_numeric($data['rate'])) {
            return $this->money4((string) $data['rate']);
        }
        throw new DomainException('Provide rate_code or an explicit rate');
    }

    private function gl(string $code): GeneralLedger
    {
        $gl = $this->em->getRepository(GeneralLedger::class)->findOneBy(['accountCode' => $code]);
        if ($gl === null) throw new DomainException("GL account '{$code}' not found");
        return $gl;
    }

    private function money(string $v): string { return number_format((float) $v, 2, '.', ''); }
    private function money4(string $v): string { return number_format((float) $v, 4, '.', ''); }

    private function assertDate(string $d): void
    {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) throw new DomainException('Invalid date — expected YYYY-MM-DD');
    }
}
