<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Infrastructure\Service\{ApiResponse, ProvisionService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * POST /api/accounting/provisions/runs
 * Body: { as_of: YYYY-MM-DD, notes? }
 *
 * Execute a provision run — compute lines, persist the run + lines,
 * post the net journal entry, return the run summary.
 *
 * Gated by accounting.provision.
 */
final class RunProvisionAction
{
    use ApiResponse;

    public function __construct(private readonly ProvisionService $service) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $userId = $request->getAttribute('user_id');
        if ($userId === null) return $this->unauthorized();

        $body = (array) ($request->getParsedBody() ?? []);
        $asOf = (string) ($body['as_of'] ?? date('Y-m-d'));
        $notes = $body['notes'] ?? null;

        try {
            $run = $this->service->run($asOf, $userId, $notes);
        } catch (\App\Domain\Exception\DomainException $e) {
            return $this->error($e->getMessage(), 400);
        } catch (\Throwable $e) {
            return $this->error('Provision run failed: ' . $e->getMessage(), 500);
        }

        return $this->success($run->toArray(false),
            "Provision run for {$asOf} posted successfully");
    }
}
