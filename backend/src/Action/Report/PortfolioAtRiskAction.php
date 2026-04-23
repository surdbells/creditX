<?php
declare(strict_types=1);
namespace App\Action\Report;

use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Portfolio At Risk (PAR) Report — industry-standard PAR30/60/90
 * metrics with per-product and per-branch breakdowns.
 *
 * Definition (CGAP / CBN / industry standard):
 *   PAR_N = (Outstanding balance of loans with at least one installment
 *           overdue by N+ days)  ÷  (Total outstanding portfolio)
 *
 * This is the LOAN-LEVEL aging metric — a loan with ANY installment
 * overdue 30+ days puts the WHOLE loan's outstanding balance into
 * PAR30. Standard industry convention and what CBN regulatory
 * returns expect.
 *
 * Distinct from Aged Receivables which buckets at the INSTALLMENT
 * level. Both views are valuable:
 *   - Aged Receivables tells you 'how much money is stuck in each
 *     age bucket right now' (installment-level, for collections)
 *   - PAR tells you 'how much of the portfolio is at risk'
 *     (loan-level, for risk management + regulatory)
 *
 * Contract:
 *   GET /api/reports/portfolio-at-risk?as_of=YYYY-MM-DD
 *       &group_by=total|product|branch
 *
 *   Default as_of = today. Default group_by = total.
 *
 * Response:
 *   { status, data: {
 *       as_of, group_by,
 *       portfolio: {
 *         total_loans,
 *         total_outstanding,
 *       },
 *       par30: { loans_at_risk, outstanding_at_risk, ratio_pct },
 *       par60: { loans_at_risk, outstanding_at_risk, ratio_pct },
 *       par90: { loans_at_risk, outstanding_at_risk, ratio_pct },
 *       breakdown: [                // if group_by != total
 *         { label, loan_count, outstanding, par30_pct, par60_pct, par90_pct }
 *       ],
 *       generated_at,
 *     } }
 *
 * Gated by reports.par (matches existing ParReportAction) —
 * PAR reports have their own permission.
 */
final class PortfolioAtRiskAction
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

        // ─── Total portfolio — all active/overdue loans' outstanding ───
        $portfolioSql = "
            SELECT
                COUNT(DISTINCT l.id) AS total_loans,
                COALESCE(SUM(
                    CAST(rs.total_amount AS NUMERIC) - CAST(rs.paid_amount AS NUMERIC)
                ), 0) AS total_outstanding
            FROM loans l
            INNER JOIN repayment_schedules rs ON rs.loan_id = l.id
            WHERE l.status IN ('active', 'overdue', 'disbursed')
              AND rs.status IN ('pending', 'partial', 'overdue')
        ";
        $portfolio = $conn->fetchAssociative($portfolioSql) ?: ['total_loans' => 0, 'total_outstanding' => 0];
        $totalOutstanding = (string) $portfolio['total_outstanding'];
        $totalLoans = (int) $portfolio['total_loans'];

        // ─── PAR at 30/60/90 ───
        $par30 = $this->computePar($conn, $asOf, 30, $totalOutstanding);
        $par60 = $this->computePar($conn, $asOf, 60, $totalOutstanding);
        $par90 = $this->computePar($conn, $asOf, 90, $totalOutstanding);

        // ─── Breakdown by product/branch ───
        $breakdown = [];
        if ($groupBy !== 'total') {
            $breakdown = $this->computeBreakdown($conn, $asOf, $groupBy);
        }

        return $this->success([
            'as_of'       => $asOf,
            'group_by'    => $groupBy,
            'portfolio'   => [
                'total_loans'       => $totalLoans,
                'total_outstanding' => $totalOutstanding,
            ],
            'par30'       => $par30,
            'par60'       => $par60,
            'par90'       => $par90,
            'breakdown'   => $breakdown,
            'generated_at' => (new \DateTimeImmutable())->format('c'),
        ]);
    }

    /**
     * Loan-level PAR: a loan counts toward PAR_N if ANY of its
     * installments is overdue by N or more days. The whole loan's
     * outstanding balance goes into the numerator.
     *
     * Uses EXISTS subquery to identify 'at-risk' loans, then sums
     * the total outstanding across those loans' schedules.
     */
    private function computePar($conn, string $asOf, int $daysOverdue, string $totalOutstanding): array
    {
        $sql = "
            SELECT
                COUNT(DISTINCT l.id) AS loans_at_risk,
                COALESCE(SUM(
                    CAST(rs.total_amount AS NUMERIC) - CAST(rs.paid_amount AS NUMERIC)
                ), 0) AS outstanding_at_risk
            FROM loans l
            INNER JOIN repayment_schedules rs ON rs.loan_id = l.id
            WHERE l.status IN ('active', 'overdue', 'disbursed')
              AND rs.status IN ('pending', 'partial', 'overdue')
              AND EXISTS (
                  SELECT 1 FROM repayment_schedules rs2
                  WHERE rs2.loan_id = l.id
                    AND rs2.status IN ('pending', 'partial', 'overdue')
                    AND :asOf::date - rs2.due_date >= :days
              )
        ";
        $row = $conn->fetchAssociative($sql, ['asOf' => $asOf, 'days' => $daysOverdue])
            ?: ['loans_at_risk' => 0, 'outstanding_at_risk' => 0];

        $outAtRisk = (string) $row['outstanding_at_risk'];
        $ratioPct = bccomp($totalOutstanding, '0.00', 2) > 0
            ? round(((float) $outAtRisk / (float) $totalOutstanding) * 100, 2)
            : 0.0;

        return [
            'loans_at_risk'       => (int) $row['loans_at_risk'],
            'outstanding_at_risk' => $outAtRisk,
            'ratio_pct'           => $ratioPct,
        ];
    }

    /**
     * Per-product or per-branch breakdown: compute loan count,
     * outstanding, and PAR30/60/90 percentages for each dimension value.
     */
    private function computeBreakdown($conn, string $asOf, string $groupBy): array
    {
        $dimColumn = $groupBy === 'product' ? 'lp.name' : 'br.name';
        $dimJoin = $groupBy === 'product'
            ? 'LEFT JOIN loan_products lp ON l.product_id = lp.id'
            : 'LEFT JOIN locations br ON l.branch_id = br.id';

        $sql = "
            SELECT
                COALESCE({$dimColumn}, 'Unassigned') AS label,
                COUNT(DISTINCT l.id) AS loan_count,
                COALESCE(SUM(
                    CAST(rs.total_amount AS NUMERIC) - CAST(rs.paid_amount AS NUMERIC)
                ), 0) AS outstanding,
                COALESCE(SUM(CASE
                    WHEN EXISTS (
                        SELECT 1 FROM repayment_schedules rs2
                        WHERE rs2.loan_id = l.id
                          AND rs2.status IN ('pending', 'partial', 'overdue')
                          AND :asOf::date - rs2.due_date >= 30
                    ) THEN CAST(rs.total_amount AS NUMERIC) - CAST(rs.paid_amount AS NUMERIC)
                    ELSE 0 END), 0) AS par30_out,
                COALESCE(SUM(CASE
                    WHEN EXISTS (
                        SELECT 1 FROM repayment_schedules rs2
                        WHERE rs2.loan_id = l.id
                          AND rs2.status IN ('pending', 'partial', 'overdue')
                          AND :asOf::date - rs2.due_date >= 60
                    ) THEN CAST(rs.total_amount AS NUMERIC) - CAST(rs.paid_amount AS NUMERIC)
                    ELSE 0 END), 0) AS par60_out,
                COALESCE(SUM(CASE
                    WHEN EXISTS (
                        SELECT 1 FROM repayment_schedules rs2
                        WHERE rs2.loan_id = l.id
                          AND rs2.status IN ('pending', 'partial', 'overdue')
                          AND :asOf::date - rs2.due_date >= 90
                    ) THEN CAST(rs.total_amount AS NUMERIC) - CAST(rs.paid_amount AS NUMERIC)
                    ELSE 0 END), 0) AS par90_out
            FROM loans l
            INNER JOIN repayment_schedules rs ON rs.loan_id = l.id
            {$dimJoin}
            WHERE l.status IN ('active', 'overdue', 'disbursed')
              AND rs.status IN ('pending', 'partial', 'overdue')
            GROUP BY label
            ORDER BY outstanding DESC
        ";

        $rows = $conn->executeQuery($sql, ['asOf' => $asOf])->fetchAllAssociative();

        return array_map(function ($r) {
            $out = (string) $r['outstanding'];
            $has = bccomp($out, '0.00', 2) > 0;
            return [
                'label'       => $r['label'],
                'loan_count'  => (int) $r['loan_count'],
                'outstanding' => $out,
                'par30_pct'   => $has ? round(((float) $r['par30_out'] / (float) $out) * 100, 2) : 0.0,
                'par60_pct'   => $has ? round(((float) $r['par60_out'] / (float) $out) * 100, 2) : 0.0,
                'par90_pct'   => $has ? round(((float) $r['par90_out'] / (float) $out) * 100, 2) : 0.0,
            ];
        }, $rows);
    }

    private function sanitizeDate(?string $input, string $default): string
    {
        if ($input === null || $input === '') return $default;
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $input) === 1) return $input;
        return $default;
    }
}
