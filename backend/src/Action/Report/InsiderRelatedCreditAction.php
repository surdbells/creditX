<?php
declare(strict_types=1);
namespace App\Action\Report;

use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * CBN Insider-Related Credit Report
 *
 * Contract:
 *   GET /api/reports/cbn/insider-related?as_of=YYYY-MM-DD
 *
 * Returns every live loan whose borrower is flagged as an insider
 * (Customer.is_insider = true). 'Insider' per CBN scope includes
 * directors, employees, and affiliated parties.
 *
 * Response shape:
 *   { data: {
 *       as_of,
 *       records: [
 *         { loan_id, application_id, borrower_name, bvn, nin,
 *           insider_relationship,  // Director, Employee, Affiliate, etc.
 *           product_name, branch_name,
 *           amount_requested, interest_rate, tenure,
 *           disbursed_at, maturity_date, status,
 *           outstanding_balance, is_overdue, max_days_overdue },
 *       ],
 *       summary: {
 *         total_insider_loans, total_outstanding,
 *         by_relationship: { director: N, employee: M, ... } },
 *     } }
 *
 * 'by_relationship' buckets the insider_relationship free-text into
 * coarse categories by case-insensitive substring match. Not perfect
 * — if your operators enter 'CEO' instead of 'Director', it won't
 * bucket correctly. The raw relationship string is preserved in each
 * record for CBN submission.
 *
 * Gated by reports.cbn.
 */
final class InsiderRelatedCreditAction
{
    use ApiResponse;

    public function __construct(private readonly EntityManagerInterface $em) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $asOf = $this->sanitizeDate($request->getQueryParams()['as_of'] ?? null, date('Y-m-d'));

        $sql = "
            SELECT
                l.id AS loan_id,
                l.application_id,
                l.status,
                c.full_name AS borrower_name,
                c.bvn,
                c.nin,
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
            WHERE c.is_insider = TRUE
              AND l.status IN ('active', 'overdue', 'disbursed', 'restructured')
              AND l.disbursed_at IS NOT NULL
              AND (l.closed_at IS NULL OR l.closed_at > :asOf)
            ORDER BY outstanding_balance DESC
        ";

        $rows = $this->em->getConnection()
            ->executeQuery($sql, ['asOf' => $asOf])
            ->fetchAllAssociative();

        $totalOutstanding = '0.00';
        $byRelationship = [
            'director' => 0, 'employee' => 0, 'affiliate' => 0, 'other' => 0,
        ];

        foreach ($rows as &$row) {
            $out = (string) $row['outstanding_balance'];
            $dpd = (int) $row['max_days_overdue'];
            $row['is_overdue'] = $dpd > 0;

            $totalOutstanding = bcadd($totalOutstanding, $out, 2);

            // Coarse bucketing by keyword — preserves raw string on record
            $rel = strtolower((string) ($row['insider_relationship'] ?? ''));
            if (str_contains($rel, 'director')) $byRelationship['director']++;
            elseif (str_contains($rel, 'employ') || str_contains($rel, 'staff')) $byRelationship['employee']++;
            elseif (str_contains($rel, 'affiliate') || str_contains($rel, 'related')) $byRelationship['affiliate']++;
            else $byRelationship['other']++;
        }
        unset($row);

        return $this->success([
            'as_of'        => $asOf,
            'records'      => $rows,
            'summary'      => [
                'total_insider_loans' => count($rows),
                'total_outstanding'   => $totalOutstanding,
                'by_relationship'     => $byRelationship,
            ],
            'generated_at' => (new \DateTimeImmutable())->format('c'),
        ]);
    }

    private function sanitizeDate(?string $input, string $default): string
    {
        if ($input === null || $input === '') return $default;
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $input) === 1) return $input;
        return $default;
    }
}
