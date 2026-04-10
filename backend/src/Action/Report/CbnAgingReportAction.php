<?php
declare(strict_types=1);
namespace App\Action\Report;
use App\Infrastructure\Service\{ApiResponse, ReportingService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class CbnAgingReportAction
{
    use ApiResponse;
    public function __construct(private readonly ReportingService $service) {}
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return $this->success($this->service->cbnAgingReport());
    }
}
