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
 *     portfolio_by_status:  [{label, value, amount}, ...],
 *     portfolio_by_product: [{label, value, amount}, ...],
 *     disbursement_trend:   [{label, value, count}, ...],  // period-bucketed
 *     collection_trend:     [{label, value}, ...],         // period-bucketed
 *     overdue_aging:        [{label, value, count}, ...],  // 4 buckets
 *     top_products:         [{label, value, amount}, ...], // top 5
 *     period:               {date_from, date_to, grain}
 *   }
 *
 * Accepts date_from / date_to (Y-m-d, inclusive). Omitted, the service
 * defaults to the current month — the same period the dashboard opens
 * on, so an unparameterised call and the first paint agree.
 *
 * overdue_aging deliberately ignores the range: aging is measured
 * against today by definition, so scoping it to a past window would
 * report bucket ages that no longer hold.
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
        $p = $request->getQueryParams();

        return $this->success($this->service->dashboardCharts(
            $p['date_from'] ?? null,
            $p['date_to'] ?? null,
        ));
    }
}
