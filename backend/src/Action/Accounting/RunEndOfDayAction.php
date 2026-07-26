<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Domain\Exception\DomainException;
use App\Infrastructure\Service\{ApiResponse, EndOfDayService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * POST /api/accounting/eod/run — close the accounting date and advance (§6).
 *
 * Body: date (defaults to the current accounting date), dry_run (validate and
 * report, change nothing).
 *
 * Gated by accounting.run_eod. A validation failure returns 422 with the step
 * results, so the operator sees exactly which check stopped the close rather
 * than a bare error.
 */
final class RunEndOfDayAction
{
    use ApiResponse;

    public function __construct(private readonly EndOfDayService $eod) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = (array) ($request->getParsedBody() ?? []);
        $date = trim((string) ($data['date'] ?? '')) ?: null;
        $dryRun = filter_var($data['dry_run'] ?? false, FILTER_VALIDATE_BOOLEAN);

        try {
            $result = $this->eod->run(
                $date,
                $request->getAttribute('user_id'),
                $dryRun,
                $this->getClientIp($request),
                $this->getUserAgent($request),
            );
        } catch (DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }

        // Failed run: 422 so the client treats it as a rejected operation, with
        // the step detail attached for display.
        if (($result['status'] ?? '') === 'failed') {
            return $this->json([
                'status'  => 'error',
                'message' => 'End-of-Day aborted — ' . (($result['errors'][0] ?? 'validation failed')),
                'data'    => $result,
            ], 422);
        }

        $message = match ($result['status']) {
            'would_succeed' => 'Validation passed — End-of-Day can run.',
            'would_fail'    => 'Validation found problems; End-of-Day would abort.',
            default         => sprintf('End-of-Day complete. Accounting date is now %s.', $result['next_date']),
        };

        return $this->success($result, $message);
    }
}
