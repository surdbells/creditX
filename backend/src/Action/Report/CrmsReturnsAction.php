<?php
declare(strict_types=1);
namespace App\Action\Report;

use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * CBN Regulatory Returns Suite (commit AG)
 *
 * Four read-only endpoints producing regulatory-format data ready
 * for CSV export and submission to CBN. Each endpoint returns a
 * flat list of records in the shape the CBN format specifies.
 *
 * Contracts:
 *
 *   GET /api/reports/cbn/crms-returns?as_of=YYYY-MM-DD
 *     Credit Risk Management System return — every credit facility
 *     with borrower BVN/NIN, loan details, status, outstanding.
 *
 *   GET /api/reports/cbn/npl-schedule?as_of=YYYY-MM-DD
 *     Non-Performing Loans schedule — loans >90 days overdue with
 *     days past due, outstanding, provision estimate.
 *
 *   GET /api/reports/cbn/insider-related?as_of=YYYY-MM-DD
 *     Loans granted to customers flagged is_insider=true, with
 *     relationship, outstanding, expiry.
 *
 *   GET /api/reports/cbn/monthly-returns?year_month=YYYY-MM
 *     Aggregate portfolio metrics for the month: new disbursements,
 *     repayments collected, portfolio outstanding, PAR, NPL %.
 *
 * Each endpoint returns: { status, data: { records: [...], summary: {...} } }
 *
 * All gated by reports.cbn permission (already seeded).
 *
 * NOTE on format: CBN prescribes specific field layouts and
 * ordering for submission. This implementation returns the DATA in
 * JSON; the frontend downloads CSV with headers in the order CBN
 * requires. For any mismatch with the current CBN spec (formats
 * evolve), edit the CSV header list in the frontend export.
 */

/**
 * CRMS Returns — every outstanding credit facility.
 */
final class CrmsReturnsAction
{
    use ApiResponse;

    public function __construct(private readonly EntityManagerInterface $em) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $asOf = $request->getQueryParams()['as_of'] ?? date('Y-m-d');

        // Every loan that has been disbursed and is not yet closed at
        // as_of date. Includes active, overdue, disbursed, restructured
        // — all are 'live' credit facilities for CBN purposes.
        //
        // No maturity_date column in loans — compute it from
        // disbursed_at + tenure (months). PostgreSQL date + interval.
        $sql = "
            SELECT
                l.id AS loan_id,
                l.application_id,
                l.status,
                c.full_name AS borrower_name,
                c.bvn,
                c.nin,
                c.gender,
                c.date_of_birth,
                c.phone,
                lp.name AS product_name,
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
                    WHERE rs.loan_id = l.id AND rs.status IN ('pending', 'partial', 'overdue')
                ), 0) AS outstanding_balance,
                br.name AS branch_name,
                c.is_insider
            FROM loans l
            INNER JOIN customers c ON l.customer_id = c.id
            LEFT JOIN loan_products lp ON l.product_id = lp.id
            LEFT JOIN locations br ON l.branch_id = br.id
            WHERE l.status IN ('active', 'overdue', 'disbursed', 'restructured')
              AND l.disbursed_at IS NOT NULL
              AND (l.closed_at IS NULL OR l.closed_at > :asOf)
            ORDER BY l.disbursed_at DESC
        ";

        $records = $this->em->getConnection()->executeQuery($sql, ['asOf' => $asOf])->fetchAllAssociative();

        return $this->success([
            'as_of'        => $asOf,
            'records'      => $records,
            'summary'      => [
                'total_facilities' => count($records),
                'total_outstanding' => array_sum(array_map(fn($r) => (float) $r['outstanding_balance'], $records)),
            ],
            'generated_at' => (new \DateTimeImmutable())->format('c'),
        ]);
    }
}
