<?php

declare(strict_types=1);

namespace App\Action\Report;

use App\Infrastructure\Service\{ApiResponse, ReportingService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Dashboard charts endpoint — returns five aggregated chart series
 * for the home dashboard's visual overview grid.
 *
 *   GET /api/reports/dashboard-charts
 *
 * Response data shape:
 *   {
 *     portfolio_by_status: [{label, value, amount}, ...],
 *     disbursement_trend:  [{label, value, count}, ...],   // 12 months
 *     collection_trend:    [{label, value}, ...],          // 12 months
 *     overdue_aging:       [{label, value, count}, ...],   // 4 buckets
 *     top_products:        [{label, value, amount}, ...]   // top 5
 *   }
 *
 * No filters — the dashboard is unfiltered, tenant-wide. Operators
 * wanting filtered analytics use /reports.
 *
 * Permission: reports.portfolio (X2a decision — same gate as the
 * existing /reports/portfolio endpoint that already feeds the
 * dashboard's KPI tiles, so no role gains or loses access).
 */
final class DashboardChartsAction
{
    use ApiResponse;

    public function __construct(
        private readonly ReportingService $service,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return $this->success($this->service->dashboardCharts());
    }
}
