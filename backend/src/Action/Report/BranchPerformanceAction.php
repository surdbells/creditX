<?php
declare(strict_types=1);
namespace App\Action\Report;
use App\Infrastructure\Service\{ApiResponse, ReportingService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class BranchPerformanceAction
{
    use ApiResponse;
    public function __construct(private readonly ReportingService $service) {}
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $p = $request->getQueryParams();
        return $this->success($this->service->branchPerformance($p['date_from'] ?? null, $p['date_to'] ?? null));
    }
}
