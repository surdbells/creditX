<?php
declare(strict_types=1);
namespace App\Action\Report;

use App\Infrastructure\Service\{ApiResponse, MonthlyLoanSummaryService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GET /api/reports/monthly-loan-summary?year=YYYY&month=M&status=...
 *
 * Legacy "Monthly Loan Summary Record". Returns every loan for the chosen
 * year + month (optionally a single status; omit or 'all' for every status).
 */
final class MonthlyLoanSummaryAction
{
    use ApiResponse;

    public function __construct(private readonly MonthlyLoanSummaryService $service) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $q = $request->getQueryParams();
        $year  = (int) ($q['year'] ?? 0);
        $month = (int) ($q['month'] ?? 0);

        if ($year < 2000 || $year > 2100) {
            return $this->validationError(['year' => 'A valid year is required.']);
        }
        if ($month < 1 || $month > 12) {
            return $this->validationError(['month' => 'A month (1-12) is required.']);
        }

        $rows = $this->service->rows($year, $month, $q['status'] ?? null);

        return $this->success([
            'rows'  => $rows,
            'count' => count($rows),
            'year'  => $year,
            'month' => $month,
        ]);
    }
}
