<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Infrastructure\Service\{ApiResponse, FixedAssetService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Depreciation endpoints:
 *   GET  /api/reports/depreciation/preview?year=&month=
 *   POST /api/accounting/depreciation/runs   { year, month }
 */
final class DepreciationAction
{
    use ApiResponse;

    public function __construct(private readonly FixedAssetService $service) {}

    public function preview(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $p = $request->getQueryParams();
        try {
            return $this->success($this->service->depreciatePreview(
                (string) ($p['year'] ?? date('Y')),
                (string) ($p['month'] ?? date('m')),
            ));
        } catch (\App\Domain\Exception\DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }
    }

    public function run(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $userId = $request->getAttribute('user_id');
        if ($userId === null) return $this->unauthorized();
        $b = (array) ($request->getParsedBody() ?? []);
        try {
            $r = $this->service->depreciateRun(
                (string) ($b['year'] ?? date('Y')),
                (string) ($b['month'] ?? date('m')),
                $userId,
            );
        } catch (\App\Domain\Exception\DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }
        return $this->success($r, "Depreciation posted for {$r['period']}");
    }
}
