<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Domain\Exception\DomainException;
use App\Infrastructure\Service\{ApiResponse, EndOfDayService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * POST /api/accounting/period/reopen — reopen a CLOSED business date (§7).
 *
 * Body: date, reason (mandatory).
 * Gated by accounting.reopen_period.
 */
final class ReopenBusinessDateAction
{
    use ApiResponse;

    public function __construct(private readonly EndOfDayService $eod) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = (array) ($request->getParsedBody() ?? []);
        $date = trim((string) ($data['date'] ?? ''));
        $reason = trim((string) ($data['reason'] ?? ''));

        $errors = [];
        if ($date === '')   $errors['date'] = 'Required.';
        if ($reason === '') $errors['reason'] = 'A reason is required to reopen a closed period.';
        if ($errors) return $this->validationError($errors);

        try {
            $row = $this->eod->reopen(
                $date, $reason,
                $request->getAttribute('user_id'),
                $this->getClientIp($request),
                $this->getUserAgent($request),
            );
        } catch (DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }

        return $this->success($row->toArray(), "Business date {$date} reopened.");
    }
}
