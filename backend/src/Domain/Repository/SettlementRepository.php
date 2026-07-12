<?php
declare(strict_types=1);
namespace App\Domain\Repository;

use App\Domain\Entity\Settlement;
use App\Domain\Enum\SettlementStatus;

class SettlementRepository extends BaseRepository
{
    protected function getEntityClass(): string { return Settlement::class; }

    /**
     * The current ACTIVE settlement for a loan (pending/processing/success),
     * if any. Used to block a duplicate payout — a loan must never be settled
     * twice concurrently. FAILED/REVERSED rows are ignored so a failed attempt
     * can be retried.
     */
    public function findActiveForLoan(string $loanId): ?Settlement
    {
        return $this->em->createQueryBuilder()
            ->select('s')->from(Settlement::class, 's')
            ->where('s.loan = :lid')
            ->andWhere('s.status IN (:active)')
            ->setParameter('lid', $loanId)
            ->setParameter('active', [
                SettlementStatus::PENDING->value,
                SettlementStatus::PROCESSING->value,
                SettlementStatus::SUCCESS->value,
            ])
            ->orderBy('s.createdAt', 'DESC')
            ->setMaxResults(1)
            ->getQuery()->getOneOrNullResult();
    }

    /** Most recent settlement (any status) for a loan. */
    public function findLatestForLoan(string $loanId): ?Settlement
    {
        return $this->em->createQueryBuilder()
            ->select('s')->from(Settlement::class, 's')
            ->where('s.loan = :lid')->setParameter('lid', $loanId)
            ->orderBy('s.createdAt', 'DESC')
            ->setMaxResults(1)
            ->getQuery()->getOneOrNullResult();
    }

    /**
     * Look up a settlement by the idempotency key we send to the provider as
     * the transfer `reference`. This is the primary webhook correlation path —
     * we control this value, so it is the most reliable handle.
     */
    public function findByIdempotencyKey(string $key): ?Settlement
    {
        return $this->em->createQueryBuilder()
            ->select('s')->from(Settlement::class, 's')
            ->where('s.idempotencyKey = :k')->setParameter('k', $key)
            ->setMaxResults(1)
            ->getQuery()->getOneOrNullResult();
    }

    /** Look up a settlement by provider + provider reference (webhook path). */
    public function findByProviderReference(string $provider, string $reference): ?Settlement
    {
        return $this->em->createQueryBuilder()
            ->select('s')->from(Settlement::class, 's')
            ->where('s.provider = :p')->andWhere('s.providerReference = :r')
            ->setParameter('p', $provider)->setParameter('r', $reference)
            ->setMaxResults(1)
            ->getQuery()->getOneOrNullResult();
    }

    /** @return array{items: Settlement[], total: int} */
    public function findPaginated(int $offset, int $limit, ?string $status = null, ?string $search = null): array
    {
        $qb = $this->em->createQueryBuilder()
            ->select('s')->from(Settlement::class, 's')
            ->innerJoin('s.loan', 'l')
            ->innerJoin('s.customer', 'c');

        if ($status !== null && $status !== '') {
            $qb->andWhere('s.status = :status')->setParameter('status', $status);
        }
        if ($search !== null && $search !== '') {
            $qb->andWhere($qb->expr()->orX(
                $qb->expr()->like('LOWER(l.applicationId)', ':q'),
                $qb->expr()->like('LOWER(c.fullName)', ':q'),
                $qb->expr()->like('s.accountNumber', ':q'),
            ))->setParameter('q', '%' . strtolower($search) . '%');
        }

        $countQb = clone $qb;
        $total = (int) $countQb->select('COUNT(s.id)')->getQuery()->getSingleScalarResult();

        $qb->orderBy('s.createdAt', 'DESC')->setFirstResult($offset)->setMaxResults($limit);
        return ['items' => $qb->getQuery()->getResult(), 'total' => $total];
    }
}
