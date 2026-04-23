<?php
declare(strict_types=1);
namespace App\Domain\Repository;

use App\Domain\Entity\LedgerTransaction;

class LedgerTransactionRepository extends BaseRepository
{
    protected function getEntityClass(): string { return LedgerTransaction::class; }

    /** @return array{items: LedgerTransaction[], total: int} */
    public function paginatedByGl(string $glId, int $offset, int $limit, ?string $year = null, ?string $month = null, ?string $day = null): array
    {
        $qb = $this->em->createQueryBuilder()->select('t')->from(LedgerTransaction::class, 't')
            ->where('t.generalLedger = :glId')->setParameter('glId', $glId);
        if ($year) $qb->andWhere('t.transYear = :y')->setParameter('y', $year);
        if ($month) $qb->andWhere('t.transMonth = :m')->setParameter('m', str_pad($month, 2, '0', STR_PAD_LEFT));
        if ($day) $qb->andWhere('t.transDay = :d')->setParameter('d', str_pad($day, 2, '0', STR_PAD_LEFT));

        $countQb = clone $qb;
        $countQb->select('COUNT(t.id)')->resetDQLPart('orderBy');
        $total = (int) $countQb->getQuery()->getSingleScalarResult();

        $qb->orderBy('t.createdAt', 'DESC')->setFirstResult($offset)->setMaxResults($limit);
        return ['items' => $qb->getQuery()->getResult(), 'total' => $total];
    }

    /** @return LedgerTransaction[] */
    public function findByCallback(string $callback): array
    {
        return $this->findBy(['transCallback' => $callback], ['createdAt' => 'ASC']);
    }

    /** Get sum for a GL account filtered by date */
    public function getGlSum(string $glId, ?string $year = null, ?string $month = null, ?string $day = null): array
    {
        /*
         * Note on the CASE/SUM pattern: DQL doesn't support CAST, but it
         * also doesn't need it here. t.transAmount maps to a DECIMAL(15,2)
         * column, which PostgreSQL sums natively with full precision.
         * The CASE returns the amount for the matching side and 0
         * otherwise; the outer SUM aggregates. A prior revision of this
         * method wrapped the amounts in CAST(... AS float), which
         * produced 'Expected known function, got CAST' from the DQL
         * parser. Removed — the decimal SUM is both correct and
         * precision-preserving (floats would have lost pennies on
         * large portfolios).
         */
        $qb = $this->em->createQueryBuilder()->select(
            "SUM(CASE WHEN t.transType = 'CR' THEN t.transAmount ELSE 0 END) as total_cr",
            "SUM(CASE WHEN t.transType = 'DR' THEN t.transAmount ELSE 0 END) as total_dr",
        )->from(LedgerTransaction::class, 't')
            ->where('t.generalLedger = :glId')->setParameter('glId', $glId);
        if ($year) $qb->andWhere('t.transYear = :y')->setParameter('y', $year);
        if ($month) $qb->andWhere('t.transMonth = :m')->setParameter('m', str_pad($month, 2, '0', STR_PAD_LEFT));
        if ($day) $qb->andWhere('t.transDay = :d')->setParameter('d', str_pad($day, 2, '0', STR_PAD_LEFT));

        $result = $qb->getQuery()->getSingleResult();
        return [
            'total_cr' => number_format((float) ($result['total_cr'] ?? 0), 2, '.', ''),
            'total_dr' => number_format((float) ($result['total_dr'] ?? 0), 2, '.', ''),
            'balance'  => number_format((float) ($result['total_cr'] ?? 0) - (float) ($result['total_dr'] ?? 0), 2, '.', ''),
        ];
    }

    /** @return LedgerTransaction[] */
    public function findByCustomerLedger(string $customerLedgerId): array
    {
        return $this->findBy(['customerLedger' => $customerLedgerId], ['createdAt' => 'DESC']);
    }
}
