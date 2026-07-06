<?php
declare(strict_types=1);

namespace App\Infrastructure\Service;

use Doctrine\ORM\EntityManagerInterface;

/**
 * Monthly Loan Summary report (legacy MONTHLY LOAN SUMMARY RECORD).
 *
 * One row per loan for a chosen year + month, optionally filtered by status.
 * The report date is disbursed_at when present, else created_at — matching the
 * legacy export where approved-but-undisbursed loans still appear under their
 * capture date. Columns mirror the legacy spreadsheet exactly.
 */
final class MonthlyLoanSummaryService
{
    public function __construct(private readonly EntityManagerInterface $em) {}

    /**
     * @return array<int, array<string, mixed>>
     */
    public function rows(int $year, int $month, ?string $status = null): array
    {
        $conn = $this->em->getConnection();

        $where = 'EXTRACT(YEAR FROM COALESCE(l.disbursed_at, l.created_at)) = :year'
            . ' AND EXTRACT(MONTH FROM COALESCE(l.disbursed_at, l.created_at)) = :month';
        $params = ['year' => $year, 'month' => $month];

        if ($status !== null && $status !== '' && strtolower($status) !== 'all') {
            $where .= ' AND l.status = :status';
            $params['status'] = $status;
        }

        $sql = "
            SELECT
                COALESCE(l.disbursed_at, l.created_at)::date        AS date,
                c.staff_id                                          AS staff_id,
                c.full_name                                         AS full_name,
                loc.name                                            AS location,
                l.amount_requested                                  AS payment_amount,
                first_rs.due_date                                   AS payment_due_date,
                c.bank_name                                         AS main_bank_name,
                c.account_number                                    AS main_bank_num,
                c.command                                           AS command,
                c.employer                                          AS employer,
                c.phone                                             AS main_number,
                l.tenure                                            AS tenure,
                l.loan_type                                         AS loan_type,
                NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '') AS dsa,
                l.net_disbursed                                     AS net_disbursed,
                l.gross_loan                                        AS gl_amount,
                COALESCE(l.top_up_balance_underwriter, l.top_up_balance) AS topup_bal,
                l.bank_statement_mode                               AS as_source,
                c.alt_bank_name                                     AS alt_bank,
                c.alt_account_number                                AS alt_acct_number,
                c.alt_phone                                         AS alt_phone_number,
                nok.phone                                           AS nok_phone,
                nok.full_name                                       AS nok_full_name,
                UPPER(l.status::text)                               AS status
            FROM loans l
            INNER JOIN customers c ON l.customer_id = c.id
            LEFT JOIN locations loc ON l.branch_id = loc.id
            LEFT JOIN users u ON l.agent_id = u.id
            LEFT JOIN LATERAL (
                SELECT n.full_name, n.phone
                FROM next_of_kins n
                WHERE n.customer_id = c.id
                ORDER BY n.is_primary DESC, n.id ASC
                LIMIT 1
            ) nok ON TRUE
            LEFT JOIN LATERAL (
                SELECT rs.due_date
                FROM repayment_schedules rs
                WHERE rs.loan_id = l.id
                ORDER BY rs.installment_number ASC
                LIMIT 1
            ) first_rs ON TRUE
            WHERE {$where}
            ORDER BY COALESCE(l.disbursed_at, l.created_at) ASC, l.application_id ASC
        ";

        return $conn->fetchAllAssociative($sql, $params);
    }
}
