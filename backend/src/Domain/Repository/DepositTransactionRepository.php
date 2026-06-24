<?php
declare(strict_types=1);
namespace App\Domain\Repository;

use App\Domain\Entity\DepositTransaction;

class DepositTransactionRepository extends BaseRepository
{
    protected function getEntityClass(): string { return DepositTransaction::class; }

    /**
     * Statement lines for an account, newest first, paginated.
     *
     * @return array{items: DepositTransaction[], total: int}
     */
    public function forAccount(string $accountId, int $offset, int $limit, ?string $fromDate = null, ?string $toDate = null): array
    {
        $qb = $this->em->createQueryBuilder()->select('t')->from(DepositTransaction::class, 't')
            ->where('t.account = :aid')->setParameter('aid', $accountId);
        if ($fromDate) {
            $qb->andWhere('t.postingDate >= :from')->setParameter('from', new \DateTimeImmutable($fromDate));
        }
        if ($toDate) {
            $qb->andWhere('t.postingDate <= :to')->setParameter('to', new \DateTimeImmutable($toDate));
        }

        $countQb = clone $qb;
        $total = (int) $countQb->select('COUNT(t.id)')->getQuery()->getSingleScalarResult();

        $items = $qb->orderBy('t.postingDate', 'DESC')->addOrderBy('t.createdAt', 'DESC')
            ->setFirstResult($offset)->setMaxResults($limit)
            ->getQuery()->getResult();

        return ['items' => $items, 'total' => $total];
    }

    /**
     * Running balance carried into $date — the balanceAfter of the most
     * recent transaction strictly before $date, or null if the account
     * had no activity before then. Used by the interest run to seed the
     * opening balance for a period.
     */
    public function balanceBefore(string $accountId, string $date): ?string
    {
        $row = $this->em->createQueryBuilder()
            ->select('t.balanceAfter')->from(DepositTransaction::class, 't')
            ->where('t.account = :aid')->setParameter('aid', $accountId)
            ->andWhere('t.postingDate < :d')->setParameter('d', new \DateTimeImmutable($date))
            ->orderBy('t.postingDate', 'DESC')->addOrderBy('t.createdAt', 'DESC')
            ->setMaxResults(1)
            ->getQuery()->getOneOrNullResult();
        return $row === null ? null : (string) $row['balanceAfter'];
    }

    /**
     * Transactions whose posting date falls in [$from, $to] inclusive,
     * oldest first — the chronological movement set the interest run walks
     * to derive the minimum / average-daily balance for the period.
     *
     * @return DepositTransaction[]
     */
    public function inPeriod(string $accountId, string $from, string $to): array
    {
        return $this->em->createQueryBuilder()
            ->select('t')->from(DepositTransaction::class, 't')
            ->where('t.account = :aid')->setParameter('aid', $accountId)
            ->andWhere('t.postingDate >= :from')->setParameter('from', new \DateTimeImmutable($from))
            ->andWhere('t.postingDate <= :to')->setParameter('to', new \DateTimeImmutable($to))
            ->orderBy('t.postingDate', 'ASC')->addOrderBy('t.createdAt', 'ASC')
            ->getQuery()->getResult();
    }
}
