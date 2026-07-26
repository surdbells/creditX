<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Infrastructure\Service\{AccountingDateService, ApiResponse};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GET /api/accounting/period/status — everything the Accounting Period
 * Management page shows (§12) and every posting screen needs (§13): the server
 * date, the accounting date, its status, the next date, the last EOD run, the
 * live configuration, and what THIS user is allowed to do with the date picker.
 *
 * Gated by accounting.view — reading the accounting date is not privileged;
 * acting on it is.
 */
final class AccountingPeriodStatusAction
{
    use ApiResponse;

    public function __construct(private readonly AccountingDateService $dates) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return $this->success($this->dates->status());
    }
}
