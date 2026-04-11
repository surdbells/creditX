<?php
declare(strict_types=1);
namespace App\Action\Report;
use App\Infrastructure\Service\{ApiResponse, ReportingService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class CustomerVarianceReportAction
{
    use ApiResponse;
    public function __construct(private readonly ReportingService $service) {}
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $p = $request->getQueryParams();
        return $this->success($this->service->customerVarianceReport($p['year_month'] ?? null, $p['product_id'] ?? null));
    }
}
