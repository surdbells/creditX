<?php
declare(strict_types=1);
namespace App\Action\Report;
use App\Infrastructure\Service\{ApiResponse, ReportingService, StatusBucketResolver};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class ProductPerformanceAction
{
    use ApiResponse;
    public function __construct(private readonly ReportingService $service) {}
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $p = $request->getQueryParams();
        $statusRaw = StatusBucketResolver::expand($p['status'] ?? null);
        return $this->success($this->service->productPerformance(
            $p['date_from']  ?? null,
            $p['date_to']    ?? null,
            $statusRaw,
            $p['branch_id']  ?? null,
            $p['product_id'] ?? null,
        ));
    }
}
