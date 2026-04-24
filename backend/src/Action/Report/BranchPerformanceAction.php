<?php
declare(strict_types=1);
namespace App\Action\Report;
use App\Infrastructure\Service\{ApiResponse, ExportService, ReportingService, StatusBucketResolver};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Branch Performance report endpoint.
 *
 * CSV view modes:
 *   - rollup (default):     one row per branch
 *   - details (drill 1):    one row per agent in the branch identified by
 *                           ?branch_id (status filter NOT applied — this
 *                           is still a rollup per Q2)
 *   - details (drill 2):    one row per loan for the agent in the branch,
 *                           auto-detected when both branch_id and agent_id
 *                           are present; status filter IS applied here.
 *
 * The detail mode auto-selects the right shape based on which drill params
 * are present, so the frontend only has to pass `view=details` + whatever
 * drill context it's currently displaying.
 */
final class BranchPerformanceAction
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
        $branchId  = $p['branch_id'] ?? null;
        $agentId   = $p['agent_id']  ?? null;

        $data = $this->service->branchPerformance(
            $p['date_from'] ?? null,
            $p['date_to']   ?? null,
            $statusRaw,
            $branchId,
            $agentId,
        );

        if (($p['format'] ?? 'json') !== 'csv') {
            return $this->success($data);
        }

        $view = ($p['view'] ?? 'rollup') === 'details' ? 'details' : 'rollup';

        if ($view === 'details' && $branchId !== null && $agentId !== null) {
            // Level-2 drill: individual loans for an agent in a branch
            $headers = ['application_id', 'customer_name', 'product_name', 'branch_name', 'status', 'amount_requested', 'net_disbursed', 'disbursed_at', 'created_at'];
            $rows = $data['details'];
            $filename = 'branch_performance_agent_loans.csv';
        } elseif ($view === 'details' && $branchId !== null) {
            // Level-1 drill: agents rollup for a branch
            $headers = ['agent_name', 'total_loans', 'approved', 'disbursed', 'rejected', 'total_amount_requested', 'total_disbursed'];
            $rows = $data['details'];
            $filename = 'branch_performance_agents.csv';
        } else {
            // Rollup: one row per branch
            $headers = ['branch_name', 'branch_code', 'total_applications', 'approvals', 'disbursements', 'rejected', 'total_amount_requested', 'total_disbursed'];
            $rows = $data['by_branch'];
            $filename = 'branch_performance.csv';
        }

        $csv = $this->export->toCsv($headers, $rows);
        $response->getBody()->write($csv);
        return $response
            ->withHeader('Content-Type', 'text/csv')
            ->withHeader('Content-Disposition', "attachment; filename=\"{$filename}\"");
    }
}
