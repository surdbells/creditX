<?php
declare(strict_types=1);
namespace App\Domain\Repository;

use App\Domain\Entity\RepaymentSchedule;

class RepaymentScheduleRepository extends BaseRepository
{
    protected function getEntityClass(): string { return RepaymentSchedule::class; }

    /** @return RepaymentSchedule[] */
    public function findByLoan(string $loanId): array { return $this->findBy(['loan' => $loanId], ['installmentNumber' => 'ASC']); }

    /**
     * Sum the outstanding balance (total_amount - paid_amount) across
     * all schedule rows for a loan. Used at disbursement time to
     * detect a top-up balance from the customer's prior active loan.
     *
     * Returns a decimal string in NUMERIC(15,2) shape.
     */
    public function sumOutstandingByLoan(string $loanId): string
    {
        $sql = 'SELECT COALESCE(SUM(CAST(total_amount AS NUMERIC) - CAST(paid_amount AS NUMERIC)), 0) AS outstanding '
             . 'FROM repayment_schedules WHERE loan_id = :loanId';
        $conn = $this->em->getConnection();
        $result = $conn->executeQuery($sql, ['loanId' => $loanId])->fetchAssociative();
        return (string) ($result['outstanding'] ?? '0');
    }

    /** @return RepaymentSchedule[] */
    public function findOverdue(): array
    {
        return $this->em->createQueryBuilder()->select('r')->from(RepaymentSchedule::class, 'r')
            ->where('r.status = :pending')->andWhere('r.dueDate < :today')
            ->setParameter('pending', 'pending')->setParameter('today', new \DateTime('today'))
            ->getQuery()->getResult();
    }

    /**
     * Loan maturity date = the latest installment due date. Null if the
     * loan has no schedule. Used to gate penalties to post-maturity only.
     */
    public function getMaturityDate(string $loanId): ?\DateTimeImmutable
    {
        $sql = 'SELECT MAX(due_date) AS maturity FROM repayment_schedules WHERE loan_id = :loanId';
        $row = $this->em->getConnection()->executeQuery($sql, ['loanId' => $loanId])->fetchAssociative();
        $val = $row['maturity'] ?? null;
        return $val !== null ? new \DateTimeImmutable((string) $val) : null;
    }
}
