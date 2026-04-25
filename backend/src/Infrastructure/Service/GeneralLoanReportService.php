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
        // Phase 3.1.b will implement.
        return ['rows' => [], 'total' => 0];
    }

    /**
     * Unpaginated rows for CSV export. Same filter signature as listLoans.
     *
     * @param array<string, mixed> $filters
     * @return array<int, array<string, mixed>>
     */
    public function exportLoans(array $filters): array
    {
        // Phase 3.1.b will implement.
        return [];
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
