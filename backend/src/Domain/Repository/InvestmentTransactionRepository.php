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
}
