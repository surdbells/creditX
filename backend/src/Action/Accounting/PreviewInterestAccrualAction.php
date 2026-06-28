<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Infrastructure\Service\{ApiResponse, InterestAccrualService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GET /api/reports/interest-accrual/preview?year=YYYY&month=MM
 *
 * Compute what an interest accrual run would post for a period without
 * persisting. Read-only; safe to hit repeatedly.
 *
 * Gated by accounting.provision (month-end accounting activity).
 */
final class PreviewInterestAccrualAction
{
    use ApiResponse;

    public function __construct(private readonly InterestAccrualService $service) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $params = $request->getQueryParams();
        $year = (string) ($params['year'] ?? date('Y'));
        $month = (string) ($params['month'] ?? date('m'));
        try {
            return $this->success($this->service->preview($year, $month));
        } catch (\App\Domain\Exception\DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }
    }
}
