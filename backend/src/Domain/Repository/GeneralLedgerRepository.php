<?php
declare(strict_types=1);
namespace App\Domain\Repository;

use App\Domain\Entity\GeneralLedger;

class GeneralLedgerRepository extends BaseRepository
{
    protected function getEntityClass(): string { return GeneralLedger::class; }

    public function findByCode(string $code): ?GeneralLedger { return $this->findOneBy(['accountCode' => strtoupper($code)]); }

    public function findByAccountNumber(string $num): ?GeneralLedger { return $this->findOneBy(['accountNumber' => $num]); }

    public function codeExists(string $code, ?string $excludeId = null): bool
    {
        $qb = $this->em->createQueryBuilder()->select('COUNT(g.id)')->from(GeneralLedger::class, 'g')
            ->where('UPPER(g.accountCode) = :code')->setParameter('code', strtoupper($code));
        if ($excludeId) $qb->andWhere('g.id != :ex')->setParameter('ex', $excludeId);
        return (int) $qb->getQuery()->getSingleScalarResult() > 0;
    }

    public function accountNumberExists(string $num, ?string $excludeId = null): bool
    {
        $qb = $this->em->createQueryBuilder()->select('COUNT(g.id)')->from(GeneralLedger::class, 'g')
            ->where('g.accountNumber = :num')->setParameter('num', $num);
        if ($excludeId) $qb->andWhere('g.id != :ex')->setParameter('ex', $excludeId);
        return (int) $qb->getQuery()->getSingleScalarResult() > 0;
    }

    /** @return array{items: GeneralLedger[], total: int} */
    public function paginated(int $offset, int $limit, string $sortBy = 'accountCode', string $sortDir = 'ASC', ?string $search = null, ?string $accountType = null, ?string $ledgerType = null): array
    {
        $qb = $this->em->createQueryBuilder()->select('g')->from(GeneralLedger::class, 'g');
        if ($accountType) $qb->andWhere('g.accountType = :at')->setParameter('at', $accountType);
        if ($ledgerType) $qb->andWhere('g.ledgerType = :lt')->setParameter('lt', $ledgerType);
        return $this->paginatedQuery($qb, 'g', $offset, $limit, $sortBy, $sortDir, $search, ['accountName', 'accountNumber', 'accountCode']);
    }

    /** @return GeneralLedger[] */
    public function findActive(): array { return $this->findBy(['isActive' => true], ['accountCode' => 'ASC']); }
}
