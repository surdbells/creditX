<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Domain\Entity\AccountingPeriod;
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * List accounting periods — all OPEN and CLOSED periods with status
 * and metadata for the period-close admin page. Returns newest first.
 *
 * Also synthesises 'missing' periods between the earliest recorded
 * period and the current month — so the admin page shows every month
 * that SHOULD have been closed, even if no AccountingPeriod row
 * exists yet for it.
 *
 * Contract:
 *   GET /api/accounting/periods
 *   Response: { data: { periods: [...] } }
 *
 * Gated by accounting.close.
 */
final class ListPeriodsAction
{
    use ApiResponse;

    public function __construct(
        private readonly EntityManagerInterface $em,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $existing = $this->em->createQueryBuilder()
            ->select('p')
            ->from(AccountingPeriod::class, 'p')
            ->orderBy('p.year', 'DESC')
            ->addOrderBy('p.month', 'DESC')
            ->getQuery()->getResult();

        // Map year-month -> row for quick lookup when synthesising.
        $byLabel = [];
        foreach ($existing as $p) {
            /** @var AccountingPeriod $p */
            $byLabel[$p->getLabel()] = $p->toArray();
        }

        // Synthesise from earliest transaction month to current month.
        // A period with no row is 'open' by default — OPEN acts as the
        // 'not-yet-closed' marker. This way the admin can see April
        // listed as Open even if nobody's ever created an explicit
        // period record yet.
        $conn = $this->em->getConnection();
        // Find the earliest posting_date so we know how far back to
        // synthesise period rows. posting_date is the Postgres-generated
        // column added in Phase 2 — replaces the prior
        // MIN(CONCAT(trans_year, '-', trans_month)) pattern.
        $earliest = $conn->fetchAssociative(
            "SELECT MIN(posting_date) AS pd FROM ledger_transactions"
        );
        // Format to 'YYYY-MM' for the cursor walk below. The query
        // returns NULL when ledger_transactions is empty (greenfield
        // tenant), in which case we fall back to today's month.
        $startLabel = (!empty($earliest['pd']))
            ? substr((string) $earliest['pd'], 0, 7)
            : date('Y-m');
        $today = date('Y-m');

        $periods = [];
        $cursor = new \DateTimeImmutable($startLabel . '-01');
        $end = new \DateTimeImmutable($today . '-01');
        while ($cursor <= $end) {
            $label = $cursor->format('Y-m');
            if (isset($byLabel[$label])) {
                $periods[] = $byLabel[$label];
            } else {
                [$y, $m] = explode('-', $label);
                $periods[] = [
                    'id'                => null,
                    'year'              => $y,
                    'month'             => $m,
                    'label'             => $label,
                    'status'            => 'open',
                    'closing_callback'  => null,
                    'net_income_posted' => null,
                    'closed_at'         => null,
                    'closed_by'         => null,
                    'notes'             => null,
                    'created_at'        => null,
                    'synthetic'         => true,
                ];
            }
            $cursor = $cursor->modify('+1 month');
        }

        // Newest first
        usort($periods, fn($a, $b) => strcmp($b['label'], $a['label']));

        return $this->success(['periods' => $periods]);
    }
}
