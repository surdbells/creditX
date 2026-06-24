<?php
declare(strict_types=1);
namespace App\Action\Deposit;

use App\Domain\Exception\DomainException;
use App\Infrastructure\Service\{ApiResponse, DepositInterestService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GET /api/deposits/interest/preview?period=YYYY-MM — read-only accrual
 * preview (what would be posted). Gated by deposits.interest.
 */
final class PreviewDepositInterestAction
{
    use ApiResponse;
    public function __construct(private readonly DepositInterestService $service) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $period = trim((string) ($request->getQueryParams()['period'] ?? date('Y-m')));
        try {
            $rows = $this->service->preview($period);
        } catch (DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }

        $total = '0.00';
        foreach ($rows as $r) {
            $total = bcadd($total, $r['interest'], 2);
        }

        return $this->success([
            'period'            => $period,
            'accounts_eligible' => count($rows),
            'total_interest'    => $total,
            'lines'             => $rows,
        ]);
    }
}
