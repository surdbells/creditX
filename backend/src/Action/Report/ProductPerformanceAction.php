<?php
declare(strict_types=1);
namespace App\Action\Report;
use App\Infrastructure\Service\{ApiResponse, ExportService, ReportingService, StatusBucketResolver};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Product Performance report endpoint.
 *
 * CSV view modes:
 *   - rollup (default): one row per product
 *   - details:          individual loans for the product at ?product_id;
 *                       respects the status filter (Q2)
 */
final class ProductPerformanceAction
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
        $data = $this->service->productPerformance(
            $p['date_from']  ?? null,
            $p['date_to']    ?? null,
            $statusRaw,
            $p['branch_id']  ?? null,
            $p['product_id'] ?? null,
        );

        if (($p['format'] ?? 'json') !== 'csv') {
            return $this->success($data);
        }

        $view = ($p['view'] ?? 'rollup') === 'details' ? 'details' : 'rollup';
        if ($view === 'details') {
            $headers = ['application_id', 'customer_name', 'agent_name', 'branch_name', 'status', 'amount_requested', 'net_disbursed', 'disbursed_at', 'created_at'];
            $rows = $data['details'];
            $filename = 'product_performance_details.csv';
        } else {
            $headers = ['product_name', 'product_code', 'total_loans', 'approved', 'disbursed_count', 'rejected', 'total_requested', 'total_disbursed'];
            $rows = $data['by_product'];
            $filename = 'product_performance.csv';
        }

        $csv = $this->export->toCsv($headers, $rows);
        $response->getBody()->write($csv);
        return $response
            ->withHeader('Content-Type', 'text/csv')
            ->withHeader('Content-Disposition', "attachment; filename=\"{$filename}\"");
    }
}
