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
    /**
     * @param array<string,mixed> $filters Optional: date_from, date_to,
     *        branch_id, product_id, agent_id, loan_type ('top_up'|'new').
     *        When date_from + date_to are both present they define the period
     *        (overriding year/month); otherwise year + month are used.
     * @return array<int, array<string, mixed>>
     */
    public function rows(int $year, int $month, ?string $status = null, array $filters = []): array
    {
        $conn = $this->em->getConnection();

        $dateFrom = $filters['date_from'] ?? null;
        $dateTo   = $filters['date_to'] ?? null;
        $params = [];

        if ($dateFrom && $dateTo) {
            $where = 'COALESCE(l.disbursed_at, l.created_at)::date BETWEEN :date_from AND :date_to';
            $params['date_from'] = $dateFrom;
            $params['date_to']   = $dateTo;
        } else {
            $where = 'EXTRACT(YEAR FROM COALESCE(l.disbursed_at, l.created_at)) = :year'
                . ' AND EXTRACT(MONTH FROM COALESCE(l.disbursed_at, l.created_at)) = :month';
            $params['year']  = $year;
            $params['month'] = $month;
        }

        if ($status !== null && $status !== '' && strtolower($status) !== 'all') {
            $where .= ' AND l.status = :status';
            $params['status'] = $status;
        }
        if (!empty($filters['branch_id'])) {
            $where .= ' AND l.branch_id = :branch_id';
            $params['branch_id'] = $filters['branch_id'];
        }
        if (!empty($filters['product_id'])) {
            $where .= ' AND l.product_id = :product_id';
            $params['product_id'] = $filters['product_id'];
        }
        if (!empty($filters['agent_id'])) {
            $where .= ' AND l.agent_id = :agent_id';
            $params['agent_id'] = $filters['agent_id'];
        }
        // Loan type is derived: a loan with any top-up balance is a top-up.
        $loanType = $filters['loan_type'] ?? null;
        if ($loanType === 'top_up') {
            $where .= ' AND COALESCE(l.top_up_balance_underwriter, l.top_up_balance, 0) > 0';
        } elseif ($loanType === 'new') {
            $where .= ' AND COALESCE(l.top_up_balance_underwriter, l.top_up_balance, 0) = 0';
        }

        $sql = "
            SELECT
                COALESCE(l.disbursed_at, l.created_at)::date        AS date,
                c.staff_id                                          AS staff_id,
                c.full_name                                         AS full_name,
                loc.name                                            AS location,
                l.amount_requested                                  AS payment_amount,
                appr.approval_date::date                            AS approval_date,
                uw.underwriter                                      AS underwriter,
                first_rs.due_date                                   AS payment_due_date,
                c.bank_name                                         AS main_bank_name,
                c.account_number                                    AS main_bank_num,
                c.command                                           AS command,
                c.employer                                          AS employer,
                c.phone                                             AS main_number,
                l.tenure                                            AS tenure,
                -- A loan with any top-up balance is a top-up, even if it was
                -- captured as a new loan (the underwriter added the balance).
                CASE WHEN COALESCE(l.top_up_balance_underwriter, l.top_up_balance, 0) > 0
                     THEN 'top_up' ELSE l.loan_type::text END       AS loan_type,
                NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '') AS dsa,
                -- Net disbursement = amount - top-up - all fees deducted from
                -- disbursement (management + bank statement + any other
                -- deducted fee). Matches the loan detail and the general
                -- report; previously this hardcoded 2% and ignored the bank
                -- statement fee.
                (l.amount_requested
                    - COALESCE(l.top_up_balance_underwriter, l.top_up_balance, 0)
                    - COALESCE(df.deducted_fees, 0))                AS net_disbursed,
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
            LEFT JOIN LATERAL (
                SELECT MAX(la.decided_at) AS approval_date
                FROM loan_approvals la
                WHERE la.loan_id = l.id AND la.status IN ('approved', 'auto_approved')
            ) appr ON TRUE
            LEFT JOIN LATERAL (
                SELECT COALESCE(SUM(fb.amount), 0) AS deducted_fees
                FROM loan_fee_breakdowns fb
                WHERE fb.loan_id = l.id AND fb.is_deducted = true
            ) df ON TRUE
            -- The underwriter who approved this loan (most recent approved
            -- decision on a step whose role is 'underwriter').
            LEFT JOIN LATERAL (
                SELECT NULLIF(TRIM(COALESCE(au.first_name, '') || ' ' || COALESCE(au.last_name, '')), '') AS underwriter
                FROM loan_approvals la2
                INNER JOIN approval_steps aps ON la2.step_id = aps.id
                INNER JOIN roles r ON aps.role_id = r.id
                INNER JOIN users au ON la2.approver_id = au.id
                WHERE la2.loan_id = l.id AND r.slug = 'underwriter'
                  AND la2.status IN ('approved', 'auto_approved')
                ORDER BY la2.decided_at DESC
                LIMIT 1
            ) uw ON TRUE
            WHERE {$where}
            ORDER BY COALESCE(l.disbursed_at, l.created_at) ASC, l.application_id ASC
        ";

        return $conn->fetchAllAssociative($sql, $params);
    }
}
