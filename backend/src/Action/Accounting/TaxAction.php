<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Domain\Entity\TaxRate;
use App\Domain\Entity\TaxTransaction;
use App\Infrastructure\Service\{ApiResponse, TaxService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Tax (VAT/WHT) endpoints:
 *   GET  /api/accounting/tax/rates
 *   POST /api/accounting/tax/rates
 *   GET  /api/accounting/tax/transactions?year=&month=
 *   POST /api/accounting/tax/transactions      { kind, base_amount, rate_code|rate, counterpart_gl_code, ... }
 *   POST /api/accounting/tax/remit             { amount, funding_gl_code?, remit_date? }
 *   GET  /api/reports/tax-summary?year=&month=
 */
final class TaxAction
{
    use ApiResponse;

    public function __construct(private readonly TaxService $service) {}

    public function listRates(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return $this->success(['rates' => array_map(fn(TaxRate $r) => $r->toArray(), $this->service->listRates())]);
    }

    public function createRate(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        if ($request->getAttribute('user_id') === null) return $this->unauthorized();
        try {
            $r = $this->service->createRate((array) ($request->getParsedBody() ?? []));
        } catch (\App\Domain\Exception\DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }
        return $this->created($r->toArray(), 'Tax rate created');
    }

    public function listTransactions(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $p = $request->getQueryParams();
        $limit = max(1, min((int) ($p['limit'] ?? 100), 500));
        $rows = $this->service->listTransactions($p['year'] ?? null, $p['month'] ?? null, $limit);
        return $this->success(['transactions' => array_map(fn(TaxTransaction $t) => $t->toArray(), $rows)]);
    }

    public function record(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $userId = $request->getAttribute('user_id');
        if ($userId === null) return $this->unauthorized();
        try {
            $t = $this->service->record((array) ($request->getParsedBody() ?? []), $userId);
        } catch (\App\Domain\Exception\DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }
        return $this->created($t->toArray(), 'Tax recorded');
    }

    public function remit(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $userId = $request->getAttribute('user_id');
        if ($userId === null) return $this->unauthorized();
        $b = (array) ($request->getParsedBody() ?? []);
        try {
            $r = $this->service->remit(
                (string) ($b['amount'] ?? '0'),
                isset($b['funding_gl_code']) ? (string) $b['funding_gl_code'] : null,
                (string) ($b['remit_date'] ?? date('Y-m-d')),
                $userId,
            );
        } catch (\App\Domain\Exception\DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }
        return $this->success($r, 'Tax remitted');
    }

    public function summary(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $p = $request->getQueryParams();
        try {
            return $this->success($this->service->report($p['year'] ?? null, $p['month'] ?? null));
        } catch (\App\Domain\Exception\DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }
    }
}
