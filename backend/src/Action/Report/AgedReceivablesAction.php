<?php
declare(strict_types=1);
namespace App\Action\Report;

use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Aged Receivables Report — buckets overdue loan installments by
 * days past due, with optional breakdowns by product and branch.
 *
 * Contract:
 *   GET /api/reports/aged-receivables?as_of=YYYY-MM-DD
 *       &group_by=total|product|branch
 *
 *   Default as_of = today. Default group_by = total.
 *
 * Response:
 *   { status, data: {
 *       as_of, group_by,
 *       buckets: {
 *         current:  { count, amount },  // not yet due
 *         days_1_30:  { count, amount },
 *         days_31_60: { count, amount },
 *         days_61_90: { count, amount },
 *         days_90_plus: { count, amount },
 *       },
 *       totals: {
 *         outstanding: string,      // all unpaid installments
 *         overdue: string,          // past due (1+ days)
 *         overdue_pct: float,       // overdue / outstanding * 100
 *       },
 *       breakdown: [                // present if group_by != 'total'
 *         { label, current_amount, days_1_30_amount, ...,
 *           overdue_amount, outstanding_amount, overdue_pct }
 *       ],
 *       generated_at,
 *     } }
 *
 * Uses the existing repayment_schedules table (already indexed on
 * loan_id + status). Installment-level aging — each unpaid schedule
 * row is aged by its due_date vs as_of.
 *
 * Gated by accounting.view.
 */
final class AgedReceivablesAction
{
    use ApiResponse;

    public function __construct(
        private readonly EntityManagerInterface $em,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $params = $request->getQueryParams();
        $asOf = $this->sanitizeDate($params['as_of'] ?? null, date('Y-m-d'));
        $groupBy = in_array(($params['group_by'] ?? 'total'), ['total', 'product', 'branch'], true)
            ? $params['group_by']
            : 'total';

        $conn = $this->em->getConnection();

        // Overall buckets. The `status IN (...)` filter keeps only
        // unpaid installments — paid ones drop out. A 'partial' status
        // means some paid but not all, so the outstanding side still
        // counts against aging.
        $bucketSql = "
            SELECT
                CASE
                    WHEN :asOf::date - rs.due_date <= 0 THEN 'current'
                    WHEN :asOf::date - rs.due_date BETWEEN 1 AND 30 THEN 'days_1_30'
                    WHEN :asOf::date - rs.due_date BETWEEN 31 AND 60 THEN 'days_31_60'
                    WHEN :asOf::date - rs.due_date BETWEEN 61 AND 90 THEN 'days_61_90'
                    ELSE 'days_90_plus'
                END AS bucket,
                COUNT(DISTINCT rs.id) AS installment_count,
                COALESCE(SUM(
                    CAST(rs.total_amount AS NUMERIC) - CAST(rs.paid_amount AS NUMERIC)
                ), 0) AS outstanding_amount
            FROM repayment_schedules rs
            INNER JOIN loans l ON rs.loan_id = l.id
            WHERE rs.status IN ('pending', 'partial', 'overdue')
              AND l.status IN ('active', 'overdue', 'disbursed')
            GROUP BY bucket
        ";
        $bucketRows = $conn->executeQuery($bucketSql, ['asOf' => $asOf])->fetchAllAssociative();

        $buckets = [
            'current'      => ['count' => 0, 'amount' => '0.00'],
            'days_1_30'    => ['count' => 0, 'amount' => '0.00'],
            'days_31_60'   => ['count' => 0, 'amount' => '0.00'],
            'days_61_90'   => ['count' => 0, 'amount' => '0.00'],
            'days_90_plus' => ['count' => 0, 'amount' => '0.00'],
        ];
        $outstanding = '0.00';
        $overdue = '0.00';
        foreach ($bucketRows as $r) {
            $bucket = $r['bucket'];
            $amt = (string) $r['outstanding_amount'];
            $cnt = (int) $r['installment_count'];
            if (isset($buckets[$bucket])) {
                $buckets[$bucket] = ['count' => $cnt, 'amount' => $amt];
            }
            $outstanding = bcadd($outstanding, $amt, 2);
            if ($bucket !== 'current') {
                $overdue = bcadd($overdue, $amt, 2);
            }
        }

        $overduePct = bccomp($outstanding, '0.00', 2) > 0
            ? round(((float) $overdue / (float) $outstanding) * 100, 2)
            : 0.0;

        // Breakdown by product or branch. Same bucket logic, grouped
        // by the relevant dimension column. When group_by = 'total',
        // we skip this entirely (empty breakdown array).
        $breakdown = [];
        if ($groupBy !== 'total') {
            $dimColumn = $groupBy === 'product' ? 'lp.name' : 'br.name';
            $dimJoin = $groupBy === 'product'
                ? 'LEFT JOIN loan_products lp ON l.product_id = lp.id'
                : 'LEFT JOIN branches br ON l.branch_id = br.id';

            $breakdownSql = "
                SELECT
                    COALESCE({$dimColumn}, 'Unassigned') AS label,
                    COALESCE(SUM(CASE WHEN :asOf::date - rs.due_date <= 0
                        THEN CAST(rs.total_amount AS NUMERIC) - CAST(rs.paid_amount AS NUMERIC)
                        ELSE 0 END), 0) AS current_amount,
                    COALESCE(SUM(CASE WHEN :asOf::date - rs.due_date BETWEEN 1 AND 30
                        THEN CAST(rs.total_amount AS NUMERIC) - CAST(rs.paid_amount AS NUMERIC)
                        ELSE 0 END), 0) AS days_1_30_amount,
                    COALESCE(SUM(CASE WHEN :asOf::date - rs.due_date BETWEEN 31 AND 60
                        THEN CAST(rs.total_amount AS NUMERIC) - CAST(rs.paid_amount AS NUMERIC)
                        ELSE 0 END), 0) AS days_31_60_amount,
                    COALESCE(SUM(CASE WHEN :asOf::date - rs.due_date BETWEEN 61 AND 90
                        THEN CAST(rs.total_amount AS NUMERIC) - CAST(rs.paid_amount AS NUMERIC)
                        ELSE 0 END), 0) AS days_61_90_amount,
                    COALESCE(SUM(CASE WHEN :asOf::date - rs.due_date > 90
                        THEN CAST(rs.total_amount AS NUMERIC) - CAST(rs.paid_amount AS NUMERIC)
                        ELSE 0 END), 0) AS days_90_plus_amount,
                    COALESCE(SUM(
                        CAST(rs.total_amount AS NUMERIC) - CAST(rs.paid_amount AS NUMERIC)
                    ), 0) AS outstanding_amount,
                    COUNT(DISTINCT l.id) AS loan_count
                FROM repayment_schedules rs
                INNER JOIN loans l ON rs.loan_id = l.id
                {$dimJoin}
                WHERE rs.status IN ('pending', 'partial', 'overdue')
                  AND l.status IN ('active', 'overdue', 'disbursed')
                GROUP BY label
                ORDER BY outstanding_amount DESC
            ";
            $breakdownRows = $conn->executeQuery(
                $breakdownSql,
                ['asOf' => $asOf],
            )->fetchAllAssociative();

            foreach ($breakdownRows as $row) {
                $out = (string) $row['outstanding_amount'];
                $ov  = bcadd(bcadd(
                    (string) $row['days_1_30_amount'],
                    (string) $row['days_31_60_amount'], 2),
                    bcadd((string) $row['days_61_90_amount'],
                          (string) $row['days_90_plus_amount'], 2),
                    2);
                $pct = bccomp($out, '0.00', 2) > 0
                    ? round(((float) $ov / (float) $out) * 100, 2)
                    : 0.0;
                $breakdown[] = [
                    'label'                => $row['label'],
                    'loan_count'           => (int) $row['loan_count'],
                    'current_amount'       => (string) $row['current_amount'],
                    'days_1_30_amount'     => (string) $row['days_1_30_amount'],
                    'days_31_60_amount'    => (string) $row['days_31_60_amount'],
                    'days_61_90_amount'    => (string) $row['days_61_90_amount'],
                    'days_90_plus_amount'  => (string) $row['days_90_plus_amount'],
                    'overdue_amount'       => $ov,
                    'outstanding_amount'   => $out,
                    'overdue_pct'          => $pct,
                ];
            }
        }

        return $this->success([
            'as_of'      => $asOf,
            'group_by'   => $groupBy,
            'buckets'    => $buckets,
            'totals'     => [
                'outstanding' => $outstanding,
                'overdue'     => $overdue,
                'overdue_pct' => $overduePct,
            ],
            'breakdown'    => $breakdown,
            'generated_at' => (new \DateTimeImmutable())->format('c'),
        ]);
    }

    private function sanitizeDate(?string $input, string $default): string
    {
        if ($input === null || $input === '') return $default;
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $input) === 1) {
            return $input;
        }
        return $default;
    }
}
