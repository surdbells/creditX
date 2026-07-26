<?php
declare(strict_types=1);
namespace App\Action\Investment;

use App\Domain\Repository\InvestmentTransactionRepository;
use App\Infrastructure\Service\{ApiResponse, GlMappingRegistry, GlMappingService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GET /api/investments/wht-remittance?from=&to= — withholding tax deducted
 * from investor interest in a period, for FIRS remittance.
 *
 * Reports two figures that answer different questions:
 *   period_total   what was withheld in the range (what you owe for it)
 *   outstanding    the current WHT Payable GL balance (what is not yet remitted
 *                  overall) — remitting is a manual journal DR WHT Payable /
 *                  CR Bank, so this only falls when that is posted.
 *
 * Gated by investments.view.
 */
final class WhtRemittanceAction
{
    use ApiResponse;

    public function __construct(
        private readonly InvestmentTransactionRepository $txnRepo,
        private readonly GlMappingService $glMapping,
        private readonly \Doctrine\ORM\EntityManagerInterface $em,
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

        $fromD = new \DateTimeImmutable($from);
        $toD   = new \DateTimeImmutable($to);

        $summary = $this->txnRepo->whtBetween($fromD, $toD);
        $lines   = $this->txnRepo->whtDetail($fromD, $toD);

        return $this->success([
            'from'         => $from,
            'to'           => $to,
            'period_count' => $summary['count'],
            'period_total' => $summary['total'],
            'outstanding'  => $this->outstandingWhtPayable(),
            'lines'        => $lines,
        ]);
    }

    /**
     * Current WHT Payable balance (a liability, so CR − DR). Falls as
     * remittances are posted against it.
     */
    private function outstandingWhtPayable(): string
    {
        $gl = $this->glMapping->resolve(GlMappingRegistry::WHT_PAYABLE);
        if ($gl === null) {
            return '0.00';
        }
        $row = $this->em->getConnection()->fetchAssociative(
            "SELECT COALESCE(SUM(CASE WHEN trans_type = 'CR' THEN CAST(trans_amount AS NUMERIC) ELSE 0 END), 0) AS cr,
                    COALESCE(SUM(CASE WHEN trans_type = 'DR' THEN CAST(trans_amount AS NUMERIC) ELSE 0 END), 0) AS dr
             FROM ledger_transactions WHERE gl_id = :gl",
            ['gl' => $gl->getId()]
        ) ?: ['cr' => 0, 'dr' => 0];

        return bcsub(
            number_format((float) $row['cr'], 2, '.', ''),
            number_format((float) $row['dr'], 2, '.', ''),
            2
        );
    }
}
