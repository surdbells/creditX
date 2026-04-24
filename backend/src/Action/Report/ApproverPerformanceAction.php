<?php
declare(strict_types=1);
namespace App\Action\Report;
use App\Infrastructure\Service\{ApiResponse, ExportService, ReportingService, StatusBucketResolver};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Approver Performance report endpoint.
 *
 * Query params:
 *   date_from, date_to, status, branch_id, approver_id, granularity
 *   format=csv + view=rollup|details|time_series
 *
 * CSV view modes:
 *   - rollup (default): one row per approver
 *   - details:          individual decisions for the approver at ?approver_id
 *   - time_series:      one row per bucket (day/week/month) with
 *                       submissions / approvals / rejections counts.
 *                       Useful for operators who want to chart the funnel
 *                       in Excel without touching the app's built-in view.
 */
final class ApproverPerformanceAction
{
    use ApiResponse;
    public function __construct(
        private readonly ReportingService $service,
        private readonly ExportService $export,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $p = $request->getQueryParams();
        $statusRaw = StatusBucketResolver::expand($p['status'] ?? null);
        $granularity = in_array($p['granularity'] ?? '', ['day','week','month'], true)
            ? $p['granularity']
            : 'day';

        $data = $this->service->approverPerformance(
            $p['date_from']    ?? null,
            $p['date_to']      ?? null,
            $statusRaw,
            $p['branch_id']    ?? null,
            $p['approver_id']  ?? null,
            $granularity,
        );

        if (($p['format'] ?? 'json') !== 'csv') {
            return $this->success($data);
        }

        $view = $p['view'] ?? 'rollup';
        if ($view === 'details') {
            $headers = ['application_id', 'customer_name', 'branch_name', 'decision', 'decided_at', 'sla_started_at', 'loan_submitted_at', 'approver_clock_hours', 'loan_clock_hours', 'comment'];
            $rows = $data['details'];
            $filename = 'approver_performance_details.csv';
        } elseif ($view === 'time_series') {
            $headers = ['period', 'submissions', 'approvals', 'rejections'];
            $rows = $data['time_series'];
            $filename = "approver_performance_time_series_{$granularity}.csv";
        } else {
            $headers = ['approver_name', 'decisions', 'approved', 'rejected', 'approval_rate', 'avg_approver_clock_hours', 'avg_loan_clock_hours'];
            $rows = $data['by_approver'];
            $filename = 'approver_performance.csv';
        }

        $csv = $this->export->toCsv($headers, $rows);
        $response->getBody()->write($csv);
        return $response
            ->withHeader('Content-Type', 'text/csv')
            ->withHeader('Content-Disposition', "attachment; filename=\"{$filename}\"");
    }
}
