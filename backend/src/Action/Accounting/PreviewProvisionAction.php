<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Infrastructure\Service\{ApiResponse, ProvisionService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GET /api/reports/provisions/preview?as_of=YYYY-MM-DD
 *
 * Compute what a provision run would post without persisting. Safe
 * to hit repeatedly; no side effects.
 *
 * Gated by accounting.provision.
 */
final class PreviewProvisionAction
{
    use ApiResponse;

    public function __construct(private readonly ProvisionService $service) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $asOf = $request->getQueryParams()['as_of'] ?? date('Y-m-d');
        try {
            return $this->success($this->service->preview($asOf));
        } catch (\App\Domain\Exception\DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }
    }
}
