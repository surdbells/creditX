<?php
declare(strict_types=1);
namespace App\Domain\Repository;

use App\Domain\Entity\RepaymentSchedule;

class RepaymentScheduleRepository extends BaseRepository
{
    protected function getEntityClass(): string { return RepaymentSchedule::class; }

    /** @return RepaymentSchedule[] */
    public function findByLoan(string $loanId): array { return $this->findBy(['loan' => $loanId], ['installmentNumber' => 'ASC']); }

    /** @return RepaymentSchedule[] */
    public function findOverdue(): array
    {
        return $this->em->createQueryBuilder()->select('r')->from(RepaymentSchedule::class, 'r')
            ->where('r.status = :pending')->andWhere('r.dueDate < :today')
            ->setParameter('pending', 'pending')->setParameter('today', new \DateTime('today'))
            ->getQuery()->getResult();
    }
}
