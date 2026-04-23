<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Infrastructure\Service\{ApiResponse, ProvisionService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * POST /api/accounting/provisions/runs/{id}/reverse
 * Body: { reason? }
 *
 * Reverse a posted provision run. The original run's journal
 * entries get mirror reversals posted at today's date, status
 * flips to 'reversed'. Used when a run contained an error or the
 * underlying data has been corrected (loan status fixed, etc).
 *
 * Because our delta logic treats 'prior provision' as the most-
 * recent non-reversed run's line, reversing a run also rebases
 * future runs' deltas to walk back to the preceding non-reversed
 * run — all handled inside ProvisionService.
 *
 * Gated by accounting.provision.
 */
final class ReverseProvisionRunAction
{
    use ApiResponse;

    public function __construct(private readonly ProvisionService $service) {}

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

        return $this->success($run->toArray(false), 'Provision run reversed');
    }
}
