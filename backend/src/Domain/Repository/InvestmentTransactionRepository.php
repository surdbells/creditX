<?php
declare(strict_types=1);
namespace App\Domain\Repository;

use App\Domain\Entity\InvestmentTransaction;

class InvestmentTransactionRepository extends BaseRepository
{
    protected function getEntityClass(): string { return InvestmentTransaction::class; }

    /** @return InvestmentTransaction[] statement for one investment, oldest first. */
    public function forInvestment(string $investmentId): array
    {
        return $this->em->createQueryBuilder()->select('t')->from(InvestmentTransaction::class, 't')
            ->where('t.investment = :id')->setParameter('id', $investmentId)
            ->orderBy('t.valueDate', 'ASC')->addOrderBy('t.createdAt', 'ASC')
            ->getQuery()->getResult();
    }

    /**
     * WHT deducted within a date range, for the remittance report.
     *
     * @return array{count:int, total:string}
     */
    public function whtBetween(\DateTimeImmutable $from, \DateTimeImmutable $to): array
    {
        $row = $this->em->getConnection()->fetchAssociative(
            "SELECT COUNT(*) AS count, COALESCE(SUM(wht_amount), 0) AS total
             FROM investment_transactions
             WHERE wht_amount IS NOT NULL AND wht_amount > 0
               AND value_date >= :from AND value_date <= :to",
            ['from' => $from->format('Y-m-d'), 'to' => $to->format('Y-m-d')]
        ) ?: [];
        return [
            'count' => (int) ($row['count'] ?? 0),
            'total' => number_format((float) ($row['total'] ?? 0), 2, '.', ''),
        ];
    }

    /**
     * Every WHT deduction in a range, with the investor it was withheld from —
     * the line detail a FIRS remittance schedule needs.
     *
     * @return array<int, array<string, mixed>>
     */
    public function whtDetail(\DateTimeImmutable $from, \DateTimeImmutable $to): array
    {
        $rows = $this->em->getConnection()->fetchAllAssociative(
            "SELECT t.value_date, t.type, t.gross_interest, t.wht_amount, t.net_interest,
                    i.investment_number, i.wht_rate,
                    c.full_name AS customer_name, c.bvn
             FROM investment_transactions t
             JOIN investments i ON i.id = t.investment_id
             JOIN customers c ON c.id = i.customer_id
             WHERE t.wht_amount IS NOT NULL AND t.wht_amount > 0
               AND t.value_date >= :from AND t.value_date <= :to
             ORDER BY t.value_date ASC, i.investment_number ASC",
            ['from' => $from->format('Y-m-d'), 'to' => $to->format('Y-m-d')]
        );

        return array_map(static fn(array $r) => [
            'value_date'        => substr((string) $r['value_date'], 0, 10),
            'investment_number' => $r['investment_number'],
            'customer_name'     => $r['customer_name'],
            'bvn'               => $r['bvn'] ?? null,
            'movement'          => $r['type'],
            'wht_rate'          => $r['wht_rate'],
            'gross_interest'    => number_format((float) $r['gross_interest'], 2, '.', ''),
            'wht_amount'        => number_format((float) $r['wht_amount'], 2, '.', ''),
            'net_interest'      => number_format((float) $r['net_interest'], 2, '.', ''),
        ], $rows);
    }
}
