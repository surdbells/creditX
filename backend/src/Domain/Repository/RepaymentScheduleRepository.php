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
     * Top-up carry-forward balance for a prior loan, per the org's settlement
     * rule:
     *   - Already-due / overdue installments (arrears): full outstanding (P+I)
     *   - Future installments: principal portion only
     *   - Minus the current month's principal (the earliest future installment)
     *     because that repayment is expected to still come in.
     *
     * @return string decimal(15,2)
     */
    public function computeTopUpCarryForward(string $loanId): string
    {
        $sql = "
            SELECT due_date,
                   CAST(principal_amount AS NUMERIC) AS principal,
                   CAST(total_amount AS NUMERIC)     AS total,
                   CAST(paid_amount AS NUMERIC)      AS paid
            FROM repayment_schedules
            WHERE loan_id = :loanId AND status IN ('pending', 'partial', 'overdue')
            ORDER BY installment_number ASC
        ";
        $rows = $this->em->getConnection()->executeQuery($sql, ['loanId' => $loanId])->fetchAllAssociative();
        $today = (new \DateTimeImmutable('today'))->format('Y-m-d');

        $arrears = '0.00';
        $futurePrincipal = '0.00';
        $firstFuturePrincipal = null;

        foreach ($rows as $r) {
            $outstanding = bcsub((string) $r['total'], (string) $r['paid'], 2);
            if (bccomp($outstanding, '0.00', 2) <= 0) {
                continue;
            }
            $due = substr((string) $r['due_date'], 0, 10);
            if ($due <= $today) {
                // Arrears — carry the full outstanding (principal + interest).
                $arrears = bcadd($arrears, $outstanding, 2);
            } else {
                // Future — carry the principal portion of the outstanding.
                $total = (string) $r['total'];
                $principalOut = bccomp($total, '0.00', 2) > 0
                    ? bcmul($outstanding, bcdiv((string) $r['principal'], $total, 6), 2)
                    : (string) $r['principal'];
                $futurePrincipal = bcadd($futurePrincipal, $principalOut, 2);
                if ($firstFuturePrincipal === null) {
                    $firstFuturePrincipal = $principalOut;
                }
            }
        }

        // Drop one current-month principal (the next upcoming installment).
        $carry = bcadd($arrears, $futurePrincipal, 2);
        if ($firstFuturePrincipal !== null) {
            $carry = bcsub($carry, $firstFuturePrincipal, 2);
        }
        if (bccomp($carry, '0.00', 2) < 0) {
            $carry = '0.00';
        }
        return $carry;
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
