<?php
declare(strict_types=1);
namespace App\Domain\Repository;

use App\Domain\Entity\Investment;
use App\Domain\Enum\InvestmentStatus;

class InvestmentRepository extends BaseRepository
{
    protected function getEntityClass(): string { return Investment::class; }

    public function numberExists(string $number): bool
    {
        return $this->findOneBy(['investmentNumber' => $number]) !== null;
    }

    /**
     * Paginated listing with search (number / customer) and filters.
     *
     * @param array{status?:?string, product_id?:?string, type?:?string, customer_id?:?string} $filters
     * @return array{items: Investment[], total: int}
     */
    public function findPaginated(int $offset, int $limit, ?string $search, array $filters, string $sortBy = 'createdAt', string $sortDir = 'DESC'): array
    {
        $qb = $this->em->createQueryBuilder()->select('i')->from(Investment::class, 'i')
            ->leftJoin('i.customer', 'c')
            ->leftJoin('i.product', 'p');

        foreach (['status' => 'i.status', 'type' => 'i.type'] as $k => $col) {
            $v = trim((string) ($filters[$k] ?? ''));
            if ($v !== '') { $qb->andWhere("{$col} = :{$k}")->setParameter($k, $v); }
        }
        if (!empty($filters['product_id'])) {
            $qb->andWhere('p.id = :pid')->setParameter('pid', $filters['product_id']);
        }
        if (!empty($filters['customer_id'])) {
            $qb->andWhere('c.id = :cid')->setParameter('cid', $filters['customer_id']);
        }
        if ($search !== null && $search !== '') {
            $qb->andWhere($qb->expr()->orX(
                $qb->expr()->like('LOWER(i.investmentNumber)', ':q'),
                $qb->expr()->like('LOWER(c.fullName)', ':q'),
            ))->setParameter('q', '%' . strtolower($search) . '%');
        }

        $countQb = clone $qb;
        $total = (int) $countQb->select('COUNT(i.id)')->getQuery()->getSingleScalarResult();

        $dir = strtoupper($sortDir) === 'ASC' ? 'ASC' : 'DESC';
        $orderCol = match ($sortBy) {
            'principal'      => 'i.principal',
            'balance'        => 'i.balance',
            'maturityDate'   => 'i.maturityDate',
            'placementDate'  => 'i.placementDate',
            'status'         => 'i.status',
            default          => 'i.createdAt',
        };
        $qb->orderBy($orderCol, $dir)->setFirstResult($offset)->setMaxResults($limit);
        return ['items' => $qb->getQuery()->getResult(), 'total' => $total];
    }

    /** @return Investment[] all active investments (for the accrual sweep). */
    public function findActive(): array
    {
        return $this->findBy(['status' => InvestmentStatus::ACTIVE->value], ['placementDate' => 'ASC']);
    }

    /**
     * Active fixed-term investments whose maturity date is on or before $asOf —
     * the maturity sweep processes these.
     *
     * @return Investment[]
     */
    public function findMaturing(\DateTimeImmutable $asOf): array
    {
        return $this->em->createQueryBuilder()->select('i')->from(Investment::class, 'i')
            ->where('i.status = :st')->setParameter('st', InvestmentStatus::ACTIVE->value)
            ->andWhere('i.maturityDate IS NOT NULL')
            ->andWhere('i.maturityDate <= :asOf')->setParameter('asOf', $asOf)
            ->orderBy('i.maturityDate', 'ASC')
            ->getQuery()->getResult();
    }

    /** @return Investment[] a customer's investments (portal — scoped to owner). */
    public function findForCustomer(string $customerId): array
    {
        return $this->em->createQueryBuilder()->select('i', 'p')->from(Investment::class, 'i')
            ->leftJoin('i.product', 'p')
            ->where('i.customer = :cid')->setParameter('cid', $customerId)
            ->orderBy('i.createdAt', 'DESC')
            ->getQuery()->getResult();
    }

    /** Portfolio totals for the admin dashboard. @return array{count:int, principal:string, balance:string, accrued:string} */
    public function portfolioTotals(): array
    {
        $row = $this->em->getConnection()->fetchAssociative(
            "SELECT COUNT(*) AS count,
                    COALESCE(SUM(principal), 0) AS principal,
                    COALESCE(SUM(balance), 0) AS balance,
                    COALESCE(SUM(accrued_interest), 0) AS accrued
             FROM investments WHERE status = :st",
            ['st' => InvestmentStatus::ACTIVE->value]
        ) ?: [];
        return [
            'count'     => (int) ($row['count'] ?? 0),
            'principal' => number_format((float) ($row['principal'] ?? 0), 2, '.', ''),
            'balance'   => number_format((float) ($row['balance'] ?? 0), 2, '.', ''),
            'accrued'   => number_format((float) ($row['accrued'] ?? 0), 2, '.', ''),
        ];
    }
}
