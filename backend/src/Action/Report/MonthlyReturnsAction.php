<?php
declare(strict_types=1);
namespace App\Action\Report;

use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * CBN Monthly Returns — aggregate portfolio metrics for a given month.
 *
 * Contract:
 *   GET /api/reports/cbn/monthly-returns?year_month=YYYY-MM
 *
 * Returns a single aggregate record (not a list) for the month.
 * Default: current month. CBN requires monthly returns by the 5th
 * working day of the following month, so typical usage is to query
 * last month after close.
 *
 * Response shape:
 *   { data: {
 *       year_month,
 *       period: { from: YYYY-MM-01, to: YYYY-MM-last_day },
 *       new_disbursements: { count, total_amount },
 *       repayments: { count, total_amount },
 *       portfolio_as_of_end: {
 *         total_loans, total_outstanding,
 *         par30_pct, par90_pct,    // industry-standard metrics
 *         npl_outstanding,          // 90+ DPD exposure
 *         npl_pct                   // npl / total_outstanding * 100
 *       },
 *       generated_at,
 *     } }
 *
 * Computed end-of-month, so PAR/NPL ratios reflect portfolio state
 * at the end of the reporting period (not as of query time).
 *
 * Gated by reports.cbn.
 */
final class MonthlyReturnsAction
{
    use ApiResponse;

    public function __construct(private readonly EntityManagerInterface $em) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $yearMonth = $this->sanitizeYearMonth(
            $request->getQueryParams()['year_month'] ?? null,
            date('Y-m'),
        );

        [$year, $month] = explode('-', $yearMonth);
        $monthStart = "{$year}-{$month}-01";
        $monthEnd = (new \DateTimeImmutable($monthStart))
            ->modify('last day of this month')->format('Y-m-d');

        $conn = $this->em->getConnection();

        // ─── New disbursements during the month ───
        // Counts loans disbursed in [month_start, month_end].
        $newDisbRow = $conn->fetchAssociative("
            SELECT
                COUNT(*) AS count,
                COALESCE(SUM(CAST(amount_requested AS NUMERIC)), 0) AS total_amount
            FROM loans
            WHERE disbursed_at IS NOT NULL
              AND disbursed_at::date >= :from
              AND disbursed_at::date <= :to
        ", ['from' => $monthStart, 'to' => $monthEnd]) ?: ['count' => 0, 'total_amount' => 0];

        // ─── Repayments collected during the month ───
        // Sum of paid_amount recorded in payments table within range.
        // Uses payments.payment_date as the canonical collection date.
        $repaymentsRow = $conn->fetchAssociative("
            SELECT
                COUNT(*) AS count,
                COALESCE(SUM(CAST(amount AS NUMERIC)), 0) AS total_amount
            FROM payments
            WHERE payment_date::date >= :from
              AND payment_date::date <= :to
              AND status = 'success'
        ", ['from' => $monthStart, 'to' => $monthEnd]) ?: ['count' => 0, 'total_amount' => 0];

        // ─── Portfolio snapshot at end of month ───
        // Total outstanding across live loans as of month_end.
        $portfolioRow = $conn->fetchAssociative("
            SELECT
                COUNT(DISTINCT l.id) AS total_loans,
                COALESCE(SUM(
                    CAST(rs.total_amount AS NUMERIC) - CAST(rs.paid_amount AS NUMERIC)
                ), 0) AS total_outstanding
            FROM loans l
            INNER JOIN repayment_schedules rs ON rs.loan_id = l.id
            WHERE l.status IN ('active', 'overdue', 'disbursed', 'restructured')
              AND l.disbursed_at IS NOT NULL
              AND l.disbursed_at::date <= :asOf
              AND (l.closed_at IS NULL OR l.closed_at::date > :asOf)
              AND rs.status IN ('pending', 'partial', 'overdue')
        ", ['asOf' => $monthEnd]) ?: ['total_loans' => 0, 'total_outstanding' => 0];

        $totalOutstanding = (string) $portfolioRow['total_outstanding'];

        // ─── PAR30 at month-end (loans with any installment 30+ DPD) ───
        $par30Row = $conn->fetchAssociative("
            SELECT COALESCE(SUM(
                CAST(rs.total_amount AS NUMERIC) - CAST(rs.paid_amount AS NUMERIC)
            ), 0) AS at_risk
            FROM loans l
            INNER JOIN repayment_schedules rs ON rs.loan_id = l.id
            WHERE l.status IN ('active', 'overdue', 'disbursed', 'restructured')
              AND rs.status IN ('pending', 'partial', 'overdue')
              AND EXISTS (
                  SELECT 1 FROM repayment_schedules rs2
                  WHERE rs2.loan_id = l.id
                    AND rs2.status IN ('pending', 'partial', 'overdue')
                    AND :asOf::date - rs2.due_date >= 30
              )
        ", ['asOf' => $monthEnd]) ?: ['at_risk' => 0];
        $par30Out = (string) $par30Row['at_risk'];
        $par30Pct = bccomp($totalOutstanding, '0.00', 2) > 0
            ? round(((float) $par30Out / (float) $totalOutstanding) * 100, 2)
            : 0.0;

        // ─── PAR90 / NPL at month-end ───
        $par90Row = $conn->fetchAssociative("
            SELECT COALESCE(SUM(
                CAST(rs.total_amount AS NUMERIC) - CAST(rs.paid_amount AS NUMERIC)
            ), 0) AS at_risk
            FROM loans l
            INNER JOIN repayment_schedules rs ON rs.loan_id = l.id
            WHERE l.status IN ('active', 'overdue', 'disbursed', 'restructured')
              AND rs.status IN ('pending', 'partial', 'overdue')
              AND EXISTS (
                  SELECT 1 FROM repayment_schedules rs2
                  WHERE rs2.loan_id = l.id
                    AND rs2.status IN ('pending', 'partial', 'overdue')
                    AND :asOf::date - rs2.due_date >= 90
              )
        ", ['asOf' => $monthEnd]) ?: ['at_risk' => 0];
        $par90Out = (string) $par90Row['at_risk'];
        $par90Pct = bccomp($totalOutstanding, '0.00', 2) > 0
            ? round(((float) $par90Out / (float) $totalOutstanding) * 100, 2)
            : 0.0;

        // NPL = 90+ DPD exposure (same as PAR90 by the loan-level
        // definition used throughout the system).
        $nplOut = $par90Out;
        $nplPct = $par90Pct;

        return $this->success([
            'year_month' => $yearMonth,
            'period'     => ['from' => $monthStart, 'to' => $monthEnd],
            'new_disbursements' => [
                'count'        => (int) $newDisbRow['count'],
                'total_amount' => (string) $newDisbRow['total_amount'],
            ],
            'repayments' => [
                'count'        => (int) $repaymentsRow['count'],
                'total_amount' => (string) $repaymentsRow['total_amount'],
            ],
            'portfolio_as_of_end' => [
                'total_loans'       => (int) $portfolioRow['total_loans'],
                'total_outstanding' => $totalOutstanding,
                'par30_outstanding' => $par30Out,
                'par30_pct'         => $par30Pct,
                'par90_outstanding' => $par90Out,
                'par90_pct'         => $par90Pct,
                'npl_outstanding'   => $nplOut,
                'npl_pct'           => $nplPct,
            ],
            'generated_at' => (new \DateTimeImmutable())->format('c'),
        ]);
    }

    private function sanitizeYearMonth(?string $input, string $default): string
    {
        if ($input === null || $input === '') return $default;
        if (preg_match('/^\d{4}-\d{2}$/', $input) === 1) return $input;
        return $default;
    }
}
