<?php
declare(strict_types=1);
namespace App\Action\Report;

use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * CBN NPL (Non-Performing Loans) Schedule
 *
 * Contract:
 *   GET /api/reports/cbn/npl-schedule?as_of=YYYY-MM-DD
 *
 * Returns every loan with at least one installment more than 90 days
 * overdue as of the supplied date. For CBN purposes, a loan is
 * non-performing when:
 *   - Principal or interest is due and unpaid for 90+ days, OR
 *   - Interest payments have been capitalised, refinanced, or rolled
 *     over (not detected by this automated query — requires manual
 *     classification)
 *
 * Response shape:
 *   { data: {
 *       as_of,
 *       records: [
 *         { loan_id, application_id, borrower_name, bvn, nin,
 *           is_insider, insider_relationship,
 *           product_name, branch_name,
 *           amount_requested, disbursed_at, maturity_date,
 *           outstanding_balance, max_days_overdue,
 *           provision_category,   // Substandard / Doubtful / Lost
 *           provision_rate,       // 0.25 / 0.50 / 1.00
 *           provision_amount      // outstanding_balance * rate
 *         }
 *       ],
 *       summary: { total_npl_loans, total_npl_outstanding,
 *                  total_provision_estimate,
 *                  by_category: { substandard, doubtful, lost } },
 *     } }
 *
 * Provisioning (CBN prudential guidelines — standard rates):
 *   - Substandard (90-179 days):   25% provision
 *   - Doubtful    (180-364 days):  50% provision
 *   - Lost        (365+ days):     100% provision
 *
 * These rates are conservative defaults. Your prudential policy may
 * differ — edit PROVISION_RATES below to customise.
 *
 * Gated by reports.cbn.
 */
final class NplScheduleAction
{
    use ApiResponse;

    /**
     * CBN prudential provisioning rates. Keyed by the lower bound
     * of the days-past-due bracket (inclusive).
     */
    private const PROVISION_RATES = [
        ['min_dpd' => 90,  'max_dpd' => 179, 'category' => 'Substandard', 'rate' => '0.25'],
        ['min_dpd' => 180, 'max_dpd' => 364, 'category' => 'Doubtful',    'rate' => '0.50'],
        ['min_dpd' => 365, 'max_dpd' => null,'category' => 'Lost',        'rate' => '1.00'],
    ];

    public function __construct(private readonly EntityManagerInterface $em) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $asOf = $this->sanitizeDate($request->getQueryParams()['as_of'] ?? null, date('Y-m-d'));

        // Every live loan plus its maximum days-past-due, where that
        // max is >= 90. LEFT JOIN on a subquery computing max_dpd per
        // loan, so we evaluate only once per loan.
        $sql = "
            SELECT
                l.id AS loan_id,
                l.application_id,
                l.status,
                c.full_name AS borrower_name,
                c.bvn,
                c.nin,
                c.is_insider,
                c.insider_relationship,
                c.phone,
                lp.name AS product_name,
                br.name AS branch_name,
                l.amount_requested,
                l.tenure,
                l.interest_rate,
                l.disbursed_at,
                CASE WHEN l.disbursed_at IS NOT NULL
                     THEN (l.disbursed_at::date + (l.tenure || ' months')::interval)::date
                     ELSE NULL END AS maturity_date,
                l.loan_purpose AS purpose,
                COALESCE((
                    SELECT SUM(CAST(rs.total_amount AS NUMERIC) - CAST(rs.paid_amount AS NUMERIC))
                    FROM repayment_schedules rs
                    WHERE rs.loan_id = l.id
                      AND rs.status IN ('pending', 'partial', 'overdue')
                ), 0) AS outstanding_balance,
                COALESCE((
                    SELECT MAX(:asOf::date - rs.due_date)
                    FROM repayment_schedules rs
                    WHERE rs.loan_id = l.id
                      AND rs.status IN ('pending', 'partial', 'overdue')
                ), 0) AS max_days_overdue
            FROM loans l
            INNER JOIN customers c ON l.customer_id = c.id
            LEFT JOIN loan_products lp ON l.product_id = lp.id
            LEFT JOIN locations br ON l.branch_id = br.id
            WHERE l.status IN ('active', 'overdue', 'disbursed', 'restructured')
              AND l.disbursed_at IS NOT NULL
              AND (l.closed_at IS NULL OR l.closed_at > :asOf)
              AND EXISTS (
                  SELECT 1 FROM repayment_schedules rs2
                  WHERE rs2.loan_id = l.id
                    AND rs2.status IN ('pending', 'partial', 'overdue')
                    AND :asOf::date - rs2.due_date >= 90
              )
            ORDER BY max_days_overdue DESC, outstanding_balance DESC
        ";

        $rows = $this->em->getConnection()
            ->executeQuery($sql, ['asOf' => $asOf])
            ->fetchAllAssociative();

        // Enrich each row with CBN provisioning category + rate +
        // computed provision amount. Running totals for summary.
        $totalOutstanding = '0.00';
        $totalProvision = '0.00';
        $byCategory = ['Substandard' => 0, 'Doubtful' => 0, 'Lost' => 0];

        foreach ($rows as &$row) {
            $dpd = (int) $row['max_days_overdue'];
            $cat = $this->classifyByDpd($dpd);
            $outstanding = (string) $row['outstanding_balance'];
            $provision = bcmul($outstanding, $cat['rate'], 2);

            $row['provision_category'] = $cat['category'];
            $row['provision_rate']     = $cat['rate'];
            $row['provision_amount']   = $provision;

            $totalOutstanding = bcadd($totalOutstanding, $outstanding, 2);
            $totalProvision   = bcadd($totalProvision, $provision, 2);
            $byCategory[$cat['category']]++;
        }
        unset($row);

        return $this->success([
            'as_of'        => $asOf,
            'records'      => $rows,
            'summary'      => [
                'total_npl_loans'          => count($rows),
                'total_npl_outstanding'    => $totalOutstanding,
                'total_provision_estimate' => $totalProvision,
                'by_category'              => [
                    'substandard' => $byCategory['Substandard'],
                    'doubtful'    => $byCategory['Doubtful'],
                    'lost'        => $byCategory['Lost'],
                ],
            ],
            'generated_at' => (new \DateTimeImmutable())->format('c'),
        ]);
    }

    /**
     * Given days-past-due, return the CBN provisioning category +
     * rate. A loan with max DPD 450 gets classified as 'Lost' (365+).
     */
    private function classifyByDpd(int $dpd): array
    {
        foreach (self::PROVISION_RATES as $bracket) {
            $min = $bracket['min_dpd'];
            $max = $bracket['max_dpd'];
            if ($dpd >= $min && ($max === null || $dpd <= $max)) {
                return $bracket;
            }
        }
        // Defensive fallback — shouldn't hit since DPD is already >=90
        return ['category' => 'Substandard', 'rate' => '0.25'];
    }

    private function sanitizeDate(?string $input, string $default): string
    {
        if ($input === null || $input === '') return $default;
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $input) === 1) return $input;
        return $default;
    }
}
