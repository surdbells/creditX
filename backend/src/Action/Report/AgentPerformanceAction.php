<?php
declare(strict_types=1);
namespace App\Action\Report;
use App\Infrastructure\Service\{ApiResponse, ExportService, ReportingService, StatusBucketResolver};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Agent Performance report endpoint.
 *
 * JSON mode (default): returns { summary, by_agent, details } structured
 * payload consumed by the admin reports page.
 *
 * CSV mode (?format=csv): streams a CSV file. The `view` query param
 * picks which slice:
 *   - view=rollup (default): exports the by_agent rollup — one row per
 *     agent with their aggregate numbers. Matches the main table on
 *     the rollup page.
 *   - view=details: exports the drill details — individual loans for
 *     the agent identified by ?agent_id. Matches what the user sees
 *     after drilling. Status filter is respected here (Q2).
 *
 * Filename embeds the view so operators can tell exports apart.
 */
final class AgentPerformanceAction
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
        $data = $this->service->agentPerformance(
            $p['date_from']   ?? null,
            $p['date_to']     ?? null,
            $p['location_id'] ?? $p['branch_id'] ?? null,
            $statusRaw,
            $p['agent_id']    ?? null,
        );

        if (($p['format'] ?? 'json') !== 'csv') {
            return $this->success($data);
        }

        $view = ($p['view'] ?? 'rollup') === 'details' ? 'details' : 'rollup';
        if ($view === 'details') {
            $headers = ['application_id', 'customer_name', 'product_name', 'branch_name', 'status', 'amount_requested', 'net_disbursed', 'disbursed_at', 'created_at'];
            $rows = $data['details'];
            $filename = 'agent_performance_details.csv';
        } else {
            $headers = ['agent_name', 'total_loans', 'captured', 'submitted', 'approved', 'disbursed', 'rejected', 'total_amount_requested', 'total_disbursed'];
            $rows = $data['by_agent'];
            $filename = 'agent_performance.csv';
        }

        $csv = $this->export->toCsv($headers, $rows);
        $response->getBody()->write($csv);
        return $response
            ->withHeader('Content-Type', 'text/csv')
            ->withHeader('Content-Disposition', "attachment; filename=\"{$filename}\"");
    }
}
