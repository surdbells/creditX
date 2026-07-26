<?php
declare(strict_types=1);
namespace App\Domain\Repository;

use App\Domain\Entity\AccountingCalendar;
use App\Domain\Enum\BusinessDateStatus;

class AccountingCalendarRepository extends BaseRepository
{
    protected function getEntityClass(): string { return AccountingCalendar::class; }

    public function findByDate(string $date): ?AccountingCalendar
    {
        return $this->em->createQueryBuilder()->select('c')->from(AccountingCalendar::class, 'c')
            ->where('c.businessDate = :d')->setParameter('d', new \DateTimeImmutable($date))
            ->getQuery()->getOneOrNullResult();
    }

    /**
     * The single OPEN business date, if there is exactly one. When several are
     * OPEN (a prior date awaiting its EOD), the EARLIEST is returned — that is
     * the date EOD must process next.
     */
    public function findEarliestOpen(): ?AccountingCalendar
    {
        return $this->em->createQueryBuilder()->select('c')->from(AccountingCalendar::class, 'c')
            ->where('c.status = :s')->setParameter('s', BusinessDateStatus::OPEN->value)
            ->orderBy('c.businessDate', 'ASC')->setMaxResults(1)
            ->getQuery()->getOneOrNullResult();
    }

    /** @return AccountingCalendar[] every OPEN date, oldest first (backdating targets). */
    public function findAllOpen(): array
    {
        return $this->em->createQueryBuilder()->select('c')->from(AccountingCalendar::class, 'c')
            ->where('c.status = :s')->setParameter('s', BusinessDateStatus::OPEN->value)
            ->orderBy('c.businessDate', 'ASC')
            ->getQuery()->getResult();
    }

    /** A date currently held by EOD — used to refuse postings mid-run. */
    public function findProcessing(): ?AccountingCalendar
    {
        return $this->em->createQueryBuilder()->select('c')->from(AccountingCalendar::class, 'c')
            ->where('c.status = :s')->setParameter('s', BusinessDateStatus::PROCESSING->value)
            ->orderBy('c.businessDate', 'ASC')->setMaxResults(1)
            ->getQuery()->getOneOrNullResult();
    }

    /** @return AccountingCalendar[] inclusive range, for the calendar view. */
    public function findBetween(string $from, string $to): array
    {
        return $this->em->createQueryBuilder()->select('c')->from(AccountingCalendar::class, 'c')
            ->where('c.businessDate >= :f')->setParameter('f', new \DateTimeImmutable($from))
            ->andWhere('c.businessDate <= :t')->setParameter('t', new \DateTimeImmutable($to))
            ->orderBy('c.businessDate', 'ASC')
            ->getQuery()->getResult();
    }

    /** Most recently completed EOD, for the "Last EOD Run" panel. */
    public function findLastCompletedEod(): ?AccountingCalendar
    {
        return $this->em->createQueryBuilder()->select('c')->from(AccountingCalendar::class, 'c')
            ->where('c.eodCompletedAt IS NOT NULL')
            ->orderBy('c.eodCompletedAt', 'DESC')->setMaxResults(1)
            ->getQuery()->getOneOrNullResult();
    }
}
