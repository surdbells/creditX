<?php
declare(strict_types=1);
namespace App\Action\Report;
use App\Infrastructure\Service\{ApiResponse, ExportService, ReportingService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class CbnNplReportAction
{
    use ApiResponse;
    public function __construct(private readonly ReportingService $service, private readonly ExportService $export) {}
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = $this->service->cbnNplReport();
        $format = $request->getQueryParams()['format'] ?? 'json';

        if ($format === 'csv') {
            $headers = ['loan_id', 'application_id', 'customer_name', 'staff_id', 'outstanding', 'days_past_due'];
            $csv = $this->export->toCsv($headers, $data);
            $response->getBody()->write($csv);
            return $response->withHeader('Content-Type', 'text/csv')->withHeader('Content-Disposition', 'attachment; filename="cbn_npl_report.csv"');
        }

        return $this->success($data);
    }
}
