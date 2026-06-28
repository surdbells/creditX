<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Infrastructure\Service\{ApiResponse, InterestAccrualService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * POST /api/accounting/interest-accrual/runs/{id}/reverse
 * Body: { reason? }
 *
 * Reverse a posted interest accrual run (mirror DR/CR at today's date,
 * status → reversed). Used to correct an erroneous accrual or to re-accrue
 * a period after fixing the underlying schedule/classification data.
 *
 * Gated by accounting.provision.
 */
final class ReverseInterestAccrualRunAction
{
    use ApiResponse;

    public function __construct(private readonly InterestAccrualService $service) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $userId = $request->getAttribute('user_id');
        if ($userId === null) return $this->unauthorized();

        $body = (array) ($request->getParsedBody() ?? []);
        $reason = $body['reason'] ?? null;

        try {
            $run = $this->service->reverseRun($args['id'] ?? '', $userId, $reason);
        } catch (\App\Domain\Exception\DomainException $e) {
            return $this->error($e->getMessage(), 400);
        } catch (\Throwable $e) {
            return $this->error('Reversal failed: ' . $e->getMessage(), 500);
        }

        return $this->success($run->toArray(false), 'Interest accrual run reversed');
    }
}
