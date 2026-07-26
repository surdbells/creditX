<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Domain\Enum\BusinessDateStatus;
use App\Domain\Repository\AccountingCalendarRepository;
use App\Infrastructure\Service\{AccountingDateService, ApiResponse};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GET /api/accounting/calendar?from=&to= — the business-date calendar (§12),
 * defaulting to the current month.
 *
 * Dates with no stored row are RETURNED ANYWAY, derived: ahead of the
 * accounting date they read FUTURE, behind it they read OPEN. Rows are only
 * materialised when something happens to them, so without this the calendar
 * would show gaps for every day the system has not yet touched.
 */
final class AccountingCalendarAction
{
    use ApiResponse;

    /** Guard against a request for a decade of days. */
    private const MAX_DAYS = 190;

    public function __construct(
        private readonly AccountingCalendarRepository $repo,
        private readonly AccountingDateService $dates,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $q = $request->getQueryParams();
        $from = trim((string) ($q['from'] ?? date('Y-m-01')));
        $to   = trim((string) ($q['to'] ?? date('Y-m-t')));

        foreach (['from' => $from, 'to' => $to] as $k => $v) {
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $v)) {
                return $this->validationError([$k => 'Expected YYYY-MM-DD.']);
            }
        }
        if ($from > $to) {
            return $this->validationError(['from' => 'The start date must be on or before the end date.']);
        }

        $start = new \DateTimeImmutable($from);
        $end   = new \DateTimeImmutable($to);
        if ((int) $start->diff($end)->days > self::MAX_DAYS) {
            return $this->validationError(['to' => 'Range too large — request at most ' . self::MAX_DAYS . ' days.']);
        }

        // Index the stored rows so derived days can fill the gaps.
        $stored = [];
        foreach ($this->repo->findBetween($from, $to) as $row) {
            $stored[$row->getDateString()] = $row->toArray();
        }

        $current = $this->dates->currentAccountingDate();
        $days = [];
        for ($d = $start; $d <= $end; $d = $d->modify('+1 day')) {
            $key = $d->format('Y-m-d');
            if (isset($stored[$key])) {
                $days[] = $stored[$key] + ['is_current' => $key === $current, 'derived' => false];
                continue;
            }
            $status = $key > $current ? BusinessDateStatus::FUTURE : BusinessDateStatus::OPEN;
            $days[] = [
                'id' => null, 'business_date' => $key,
                'status' => $status->value, 'status_label' => $status->label(), 'tone' => $status->tone(),
                'opened_by' => null, 'opened_at' => null, 'closed_by' => null, 'closed_at' => null,
                'eod_started_at' => null, 'eod_completed_at' => null, 'eod_result' => null,
                'reopen_count' => 0, 'notes' => null,
                'is_current' => $key === $current,
                // Not stored — inferred from its position relative to the
                // accounting date, so the calendar has no gaps.
                'derived' => true,
            ];
        }

        return $this->success([
            'from' => $from, 'to' => $to,
            'accounting_date' => $current,
            'server_date' => $this->dates->serverDate(),
            'days' => $days,
        ]);
    }
}
