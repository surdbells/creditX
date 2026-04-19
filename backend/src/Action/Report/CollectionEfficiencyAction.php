<?php
declare(strict_types=1);
namespace App\Action\Report;

use App\Infrastructure\Service\{ApiResponse, ReportingService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class CollectionEfficiencyAction
{
    use ApiResponse;
    public function __construct(private readonly ReportingService $service) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $p = $request->getQueryParams();
        $result = $this->service->collectionEfficiency(
            $p['date_from'] ?? null,
            $p['date_to'] ?? null,
            $p['agent_id'] ?? null,
        );
        return $this->success($result);
    }
}
