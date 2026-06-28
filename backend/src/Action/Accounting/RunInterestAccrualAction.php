<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Infrastructure\Service\{ApiResponse, InterestAccrualService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * POST /api/accounting/interest-accrual/runs
 * Body: { year: YYYY, month: MM, notes? }
 *
 * Post a loan-interest accrual for a period — compute lines, persist the
 * run + lines, post the journal (DR INTRECV / CR II or INTSUSP).
 *
 * Gated by accounting.provision.
 */
final class RunInterestAccrualAction
{
    use ApiResponse;

    public function __construct(private readonly InterestAccrualService $service) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $userId = $request->getAttribute('user_id');
        if ($userId === null) return $this->unauthorized();

        $body = (array) ($request->getParsedBody() ?? []);
        $year = (string) ($body['year'] ?? date('Y'));
        $month = (string) ($body['month'] ?? date('m'));
        $notes = $body['notes'] ?? null;

        try {
            $run = $this->service->run($year, $month, $userId, $notes);
        } catch (\App\Domain\Exception\DomainException $e) {
            return $this->error($e->getMessage(), 400);
        } catch (\Throwable $e) {
            return $this->error('Interest accrual failed: ' . $e->getMessage(), 500);
        }

        return $this->success($run->toArray(false),
            "Interest accrual for {$run->getLabel()} posted successfully");
    }
}
