<?php
declare(strict_types=1);
namespace App\Action\Report;
use App\Infrastructure\Service\{ApiResponse, ExportService, ReportingService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class CbnPortfolioReportAction
{
    use ApiResponse;
    public function __construct(private readonly ReportingService $service, private readonly ExportService $export) {}
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = $this->service->cbnPortfolioReport();
        $format = $request->getQueryParams()['format'] ?? 'json';

        if ($format === 'csv') {
            $headers = ['customer_name', 'staff_id', 'loan_amount', 'outstanding', 'days_past_due', 'status'];
            $csv = $this->export->toCsv($headers, $data);
            $response->getBody()->write($csv);
            return $response->withHeader('Content-Type', 'text/csv')->withHeader('Content-Disposition', 'attachment; filename="cbn_portfolio_report.csv"');
        }

        return $this->success($data);
    }
}
