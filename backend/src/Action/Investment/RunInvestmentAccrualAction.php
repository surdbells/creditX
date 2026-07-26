<?php
declare(strict_types=1);
namespace App\Action\Investment;

use App\Domain\Exception\DomainException;
use App\Infrastructure\Service\{ApiResponse, AuditService, InvestmentService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Investment interest accrual run.
 *
 *   GET  /api/investments/accrual/preview   compute only, posts nothing
 *   POST /api/investments/accrual/run       posts the journals
 *
 * Gated by investments.interest. Body/query: as_of, settlement_gl_id
 * (needed because periodic-payout investments pay cash out on accrual).
 *
 * The run is all-or-nothing: a partially-applied interest run is far harder to
 * reconcile than a failed one, so a single bad investment aborts the batch and
 * is named in the error.
 */
final class RunInvestmentAccrualAction
{
    use ApiResponse;

    public function __construct(
        private readonly InvestmentService $service,
        private readonly AuditService $audit,
        private readonly bool $preview = false,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $src = $this->preview
            ? $request->getQueryParams()
            : (array) ($request->getParsedBody() ?? []);

        $asOf = trim((string) ($src['as_of'] ?? date('Y-m-d')));
        $settlement = trim((string) ($src['settlement_gl_id'] ?? ''));
        if ($settlement === '') {
            return $this->validationError(['settlement_gl_id' => 'Required — periodic-payout investments pay interest out of this account.']);
        }

        $userId = $request->getAttribute('user_id');
        try {
            $result = $this->service->accrueAll($asOf, $settlement, $userId, $this->preview);
        } catch (DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }

        if (!$this->preview) {
            $this->audit->logCreate(
                $userId, 'InvestmentAccrualRun', $asOf,
                ['as_of' => $asOf, 'investments' => $result['investments'], 'gross' => $result['gross'], 'wht' => $result['wht']],
                $this->getClientIp($request), $this->getUserAgent($request),
            );
        }

        return $this->success($result, $this->preview
            ? 'Accrual preview computed'
            : sprintf('Accrued %d investment(s) — gross %s, WHT %s', $result['investments'], $result['gross'], $result['wht']));
    }
}
