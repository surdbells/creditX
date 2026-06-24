<?php
declare(strict_types=1);
namespace App\Domain\Repository;

use App\Domain\Entity\DepositAccount;

class DepositAccountRepository extends BaseRepository
{
    protected function getEntityClass(): string { return DepositAccount::class; }

    public function findByAccountNumber(string $num): ?DepositAccount
    {
        return $this->findOneBy(['accountNumber' => $num]);
    }

    public function accountNumberExists(string $num): bool
    {
        $qb = $this->em->createQueryBuilder()->select('COUNT(a.id)')->from(DepositAccount::class, 'a')
            ->where('a.accountNumber = :num')->setParameter('num', $num);
        return (int) $qb->getQuery()->getSingleScalarResult() > 0;
    }

    /** @return DepositAccount[] */
    public function findByCustomer(string $customerId): array
    {
        return $this->em->createQueryBuilder()
            ->select('a')->from(DepositAccount::class, 'a')
            ->where('a.customer = :cid')->setParameter('cid', $customerId)
            ->orderBy('a.createdAt', 'DESC')
            ->getQuery()->getResult();
    }

    /**
     * @return array{items: DepositAccount[], total: int}
     */
    public function paginated(int $offset, int $limit, string $sortBy = 'createdAt', string $sortDir = 'DESC', ?string $search = null, ?string $status = null, ?string $productId = null): array
    {
        $qb = $this->em->createQueryBuilder()->select('a')->from(DepositAccount::class, 'a');
        if ($status) {
            $qb->andWhere('a.status = :st')->setParameter('st', $status);
        }
        if ($productId) {
            $qb->andWhere('a.product = :pid')->setParameter('pid', $productId);
        }
        return $this->paginatedQuery($qb, 'a', $offset, $limit, $sortBy, $sortDir, $search, ['accountNumber']);
    }

    /**
     * Active accounts whose product accrues interest (interestMethod != NONE).
     * The monthly interest run iterates this set.
     *
     * @return DepositAccount[]
     */
    public function findInterestBearingActive(): array
    {
        return $this->em->createQueryBuilder()
            ->select('a')->from(DepositAccount::class, 'a')
            ->join('a.product', 'p')
            ->where('a.status = :st')->setParameter('st', \App\Domain\Enum\DepositAccountStatus::ACTIVE->value)
            ->andWhere('p.interestMethod != :none')->setParameter('none', \App\Domain\Enum\DepositInterestMethod::NONE->value)
            ->orderBy('a.accountNumber', 'ASC')
            ->getQuery()->getResult();
    }

    /**
     * Sum of all open deposit-account balances — the subsidiary-ledger
     * total that should tie to the CUSTDEP GL control balance.
     */
    public function totalBalance(): string
    {
        $sum = $this->em->createQueryBuilder()
            ->select('COALESCE(SUM(a.balance), 0)')->from(DepositAccount::class, 'a')
            ->getQuery()->getSingleScalarResult();
        return (string) $sum;
    }
}
