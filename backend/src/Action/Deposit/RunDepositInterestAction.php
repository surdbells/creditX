<?php
declare(strict_types=1);
namespace App\Action\Deposit;

use App\Domain\Exception\DomainException;
use App\Infrastructure\Service\{ApiResponse, AuditService, DepositInterestService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * POST /api/deposits/interest/run — post the monthly interest accrual for
 * a period (body: { period: "YYYY-MM" }). Gated by deposits.interest.
 */
final class RunDepositInterestAction
{
    use ApiResponse;

    public function __construct(
        private readonly DepositInterestService $service,
        private readonly AuditService $audit,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = (array) ($request->getParsedBody() ?? []);
        $period = trim((string) ($data['period'] ?? date('Y-m')));

        $userId = $request->getAttribute('user_id');
        try {
            $summary = $this->service->run($period, $userId);
        } catch (DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }

        $this->audit->logCreate(
            $userId, 'DepositInterestRun', $period,
            ['period' => $period, 'accounts_credited' => $summary['accounts_credited'], 'total_interest' => $summary['total_interest']],
            $this->getClientIp($request), $this->getUserAgent($request),
        );
        return $this->success($summary, sprintf('Interest posted to %d account(s).', $summary['accounts_credited']));
    }
}
