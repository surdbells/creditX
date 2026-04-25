<?php

declare(strict_types=1);

namespace App\Infrastructure\Service;

use Doctrine\ORM\EntityManagerInterface;

/**
 * General Loan Report — produces the wide flat-row export operators
 * are migrating to from their legacy monthly CSV. Every row corresponds
 * to one loan and includes 44 fields spanning customer demographics,
 * employment, KYC, banking, NOK, and loan-specific terms.
 *
 * The shape is intentionally LEGACY-COMPATIBLE — the column order and
 * naming match the existing MONTHLY_GENERAL_REPORT.csv export so finance/
 * compliance teams can swap the source without retraining downstream
 * consumers (Excel pivots, regulators, manual workflows).
 *
 * Two data paths share the same filter set:
 *   - listLoans(): paginated rows for the on-screen table
 *   - exportLoans(): full unpaginated rows for CSV download
 *
 * Five chart methods complement the table with summary visuals — all
 * respect the same filters so the charts always reflect what the
 * operator is currently looking at.
 *
 * Skeleton only: this commit (Phase 3.1.a) wires up the class and
 * routing; SQL implementation follows in Phase 3.1.b.
 */
final class GeneralLoanReportService
{
    public function __construct(private readonly EntityManagerInterface $em)
    {
    }

    /**
     * Paginated list of loan rows matching the filters.
     *
     * @param array{
     *   date_from?: string|null, date_to?: string|null,
     *   status?: string|null, branch_id?: string|null,
     *   product_id?: string|null, agent_id?: string|null,
     *   loan_type?: string|null
     * } $filters
     * @return array{rows: array<int, array<string, mixed>>, total: int}
     */
    public function listLoans(array $filters, int $offset = 0, int $limit = 50): array
    {
        $conn = $this->em->getConnection();
        [$where, $params] = $this->buildWhereClause($filters);

        $countSql = "SELECT COUNT(*) FROM loans l WHERE {$where}";
        $total = (int) $conn->fetchOne($countSql, $params);

        if ($total === 0) {
            return ['rows' => [], 'total' => 0];
        }

        $rows = $this->fetchRows($where, $params, $offset, $limit);
        return ['rows' => $rows, 'total' => $total];
    }

    /**
     * Unpaginated rows for CSV export. Same filter signature as listLoans.
     *
     * @param array<string, mixed> $filters
     * @return array<int, array<string, mixed>>
     */
    public function exportLoans(array $filters): array
    {
        [$where, $params] = $this->buildWhereClause($filters);
        // Hard ceiling — operators running this monthly should not be
        // pulling 100k+ rows in one shot. If a tenant ever needs more,
        // we'll add date-range chunking server-side.
        return $this->fetchRows($where, $params, 0, 50000);
    }

    /**
     * Build the WHERE clause shared by list, export, and chart queries.
     * Returns [whereSql, paramArray] where the SQL fragment NEVER starts
     * with WHERE so callers can compose freely.
     *
     * Bucket-style status filter (Q2 from earlier reports) is intentionally
     * NOT applied here — the general loan report's status filter is
     * literal: pick a raw status, see only loans in that status. Aligns
     * with how operators describe what they want ('show me all rejected
     * loans this month'). For backward compat with the StatusBucketResolver
     * vocabulary, we accept bucket slugs and expand them; if 'status' is
     * a raw LoanStatus value we use it directly.
     *
     * @param array<string, mixed> $filters
     * @return array{0: string, 1: array<string, mixed>}
     */
    private function buildWhereClause(array $filters): array
    {
        $where = '1 = 1';
        $params = [];

        // Date range — interpreted as the primary report date, which we
        // treat as disbursed_at when set, falling back to created_at for
        // un-disbursed loans. Mirrors the legacy CSV's 'DATE' column
        // semantics where APPROVED-but-not-disbursed rows still appeared
        // in the monthly export under their creation date.
        if (!empty($filters['date_from'])) {
            $where .= " AND COALESCE(l.disbursed_at, l.created_at) >= :date_from";
            $params['date_from'] = $filters['date_from'];
        }
        if (!empty($filters['date_to'])) {
            $where .= " AND COALESCE(l.disbursed_at, l.created_at) <= :date_to";
            $params['date_to'] = $filters['date_to'] . ' 23:59:59';
        }

        if (!empty($filters['status'])) {
            $bucket = StatusBucketResolver::expand($filters['status']);
            if ($bucket !== null && !empty($bucket)) {
                // Bucket — multi-value
                $placeholders = [];
                foreach ($bucket as $i => $s) {
                    $k = "status_{$i}";
                    $placeholders[] = ":{$k}";
                    $params[$k] = $s;
                }
                $where .= ' AND l.status IN (' . implode(',', $placeholders) . ')';
            } else {
                // Raw status — single value
                $where .= " AND l.status = :status";
                $params['status'] = $filters['status'];
            }
        }

        if (!empty($filters['branch_id'])) {
            $where .= " AND l.branch_id = :branch_id";
            $params['branch_id'] = $filters['branch_id'];
        }
        if (!empty($filters['product_id'])) {
            $where .= " AND l.product_id = :product_id";
            $params['product_id'] = $filters['product_id'];
        }
        if (!empty($filters['agent_id'])) {
            $where .= " AND l.agent_id = :agent_id";
            $params['agent_id'] = $filters['agent_id'];
        }
        if (!empty($filters['loan_type'])) {
            $where .= " AND l.loan_type = :loan_type";
            $params['loan_type'] = $filters['loan_type'];
        }

        return [$where, $params];
    }

    /**
     * The big join — every column the legacy MONTHLY_GENERAL_REPORT.csv
     * exposes, plus a couple of internal IDs the frontend uses for drill
     * actions. Subqueries fetch:
     *   - primary NOK (is_primary=true preferred, else first by created_at)
     *   - earliest repayment_schedule row (installment_number=1)
     *   - the Bank Statement Fee amount via fee_breakdowns join on
     *     fee_types.code='BSA' (the seeded code; if absent on a
     *     tenant the column will be NULL which the frontend renders
     *     as blank, matching how the legacy CSV behaves)
     *
     * Postgres-specific: the LATERAL joins keep the per-loan subquery
     * logic readable without forcing a CTE that the planner might
     * materialize. On large datasets this stays fast because each
     * lateral runs against its own indexed FK.
     *
     * @param array<string, mixed> $params
     * @return array<int, array<string, mixed>>
     */
    private function fetchRows(string $where, array $params, int $offset, int $limit): array
    {
        $conn = $this->em->getConnection();

        $sql = "
            SELECT
                -- Loan identifiers
                l.id AS loan_id,
                l.application_id,

                -- Column 1: DATE — disbursed when present, else captured
                COALESCE(l.disbursed_at, l.created_at)::date AS date,

                -- Customer columns 2-14
                c.staff_id,
                c.full_name AS customer_name,
                c.phone AS mobile,
                c.gender,
                c.date_of_birth,
                c.mothers_maiden_name AS mother_maiden_name,
                c.religion,
                c.marital_status,
                c.home_address AS address,
                c.state_of_origin AS state,
                c.lga,
                c.number_of_children AS no_of_children,
                c.bvn,

                -- NOK columns 15-18
                nok.full_name AS name_of_next_of_kin,
                nok.address AS address_of_next_of_kin,
                nok.relationship,
                nok.phone AS phone_no_of_next_of_kin,

                -- Employment columns 19-23
                c.employer AS group_name_employer,
                loc.name AS branch,
                c.gross_pay AS salary,
                c.employment_date,
                -- Computed retirement date: DOB + 60 years (Nigerian civil
                -- service convention). Returns NULL when DOB is unknown.
                CASE WHEN c.date_of_birth IS NOT NULL
                     THEN (c.date_of_birth + INTERVAL '60 years')::date
                     ELSE NULL END AS retirement_date,

                -- ID columns 24-27
                c.id_type AS means_of_identification,
                c.work_id_number AS id_number,
                c.work_id_issued_date AS id_issued_date,
                c.work_id_expiry_date AS id_expiry_date,

                -- Banking columns 28-30
                COALESCE(c.full_name, '') AS account_name,
                c.account_number AS primary_account_no,
                c.bank_name AS primary_bank_name,

                -- Loan-specific columns 31-41
                l.loan_type,
                l.disbursed_at AS date_issued,
                l.amount_requested AS approved_amount,
                bsa_fee.amount AS bank_statement_fee,
                l.gross_loan AS gross_loan_amount,
                l.net_disbursed AS net_disbursement,
                COALESCE(l.top_up_balance_underwriter, l.top_up_balance) AS top_up_balance,
                l.interest_rate,
                first_rs.total_amount AS repayment_amount,
                first_rs.due_date AS first_repayment_date,
                l.tenure AS tenor,

                -- DSA — agent's email per the legacy CSV convention
                u.email AS dsa,

                -- Channel — hardcoded per Ch1 decision; kept as a column
                -- value rather than a constant in PHP so the SQL is the
                -- single source of truth.
                'Direct' AS channel,

                -- Status (uppercased to match the legacy CSV)
                UPPER(l.status::text) AS status

            FROM loans l
            INNER JOIN customers c ON l.customer_id = c.id
            LEFT JOIN locations loc ON l.branch_id = loc.id
            LEFT JOIN users u ON l.agent_id = u.id

            -- Primary NOK with fallback to any NOK
            LEFT JOIN LATERAL (
                SELECT n.full_name, n.address, n.relationship, n.phone
                FROM next_of_kins n
                WHERE n.customer_id = c.id
                ORDER BY n.is_primary DESC, n.id ASC
                LIMIT 1
            ) nok ON TRUE

            -- First scheduled repayment (installment_number=1)
            LEFT JOIN LATERAL (
                SELECT rs.total_amount, rs.due_date
                FROM repayment_schedules rs
                WHERE rs.loan_id = l.id
                ORDER BY rs.installment_number ASC
                LIMIT 1
            ) first_rs ON TRUE

            -- Bank Statement Fee, found via fee_types.code='BSA'
            LEFT JOIN LATERAL (
                SELECT fb.amount
                FROM loan_fee_breakdowns fb
                INNER JOIN fee_types ft ON fb.fee_type_id = ft.id
                WHERE fb.loan_id = l.id AND ft.code = 'BSA'
                LIMIT 1
            ) bsa_fee ON TRUE

            WHERE {$where}
            ORDER BY COALESCE(l.disbursed_at, l.created_at) DESC, l.id DESC
            OFFSET :offset LIMIT :limit
        ";

        $params['offset'] = $offset;
        $params['limit'] = $limit;

        return $conn->fetchAllAssociative($sql, $params);
    }

    /**
     * Five chart series. Each entry is a small array of {label, value}
     * tuples ready for the front-end SVG renderer.
     *
     * @param array<string, mixed> $filters
     * @return array{
     *   monthly_disbursement: array<int, array{label: string, value: float}>,
     *   status_distribution: array<int, array{label: string, value: int}>,
     *   top_agents: array<int, array{label: string, value: int}>,
     *   product_mix: array<int, array{label: string, value: int}>,
     *   branch_performance: array<int, array{label: string, value: float, count: int}>
     * }
     */
    public function chartData(array $filters): array
    {
        // Phase 3.1.d will implement.
        return [
            'monthly_disbursement' => [],
            'status_distribution'  => [],
            'top_agents'           => [],
            'product_mix'          => [],
            'branch_performance'   => [],
        ];
    }
}
