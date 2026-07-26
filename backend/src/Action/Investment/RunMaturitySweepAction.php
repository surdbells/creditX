<?php
declare(strict_types=1);
namespace App\Action\Investment;

use App\Domain\Exception\DomainException;
use App\Infrastructure\Service\{ApiResponse, AuditService, InvestmentService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * POST /api/investments/maturity/run — settle every fixed-term investment that
 * has reached maturity, rolling over the ones flagged for it.
 *
 * The same operation the scheduled job runs; exposed so an operator can trigger
 * it (or catch up after downtime). Gated by investments.transact.
 *
 * Body: as_of (default today), settlement_gl_id (default: the Default Ledgers
 * "Default Investment Settlement" account).
 */
final class RunMaturitySweepAction
{
    use ApiResponse;

    public function __construct(
        private readonly InvestmentService $service,
        private readonly AuditService $audit,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = (array) ($request->getParsedBody() ?? []);
        $asOf = trim((string) ($data['as_of'] ?? date('Y-m-d')));
        $settlement = trim((string) ($data['settlement_gl_id'] ?? '')) ?: null;

        $userId = $request->getAttribute('user_id');
        try {
            $result = $this->service->processMaturities($asOf, $userId, $settlement);
        } catch (DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }

        $this->audit->logCreate(
            $userId, 'InvestmentMaturitySweep', $asOf,
            ['as_of' => $asOf, 'matured' => $result['matured'], 'rolled_over' => $result['rolled_over'], 'failed' => $result['failed']],
            $this->getClientIp($request), $this->getUserAgent($request),
        );

        return $this->success($result, sprintf(
            'Matured %d, rolled over %d%s',
            $result['matured'], $result['rolled_over'],
            $result['failed'] > 0 ? sprintf(' — %d failed, see lines', $result['failed']) : '',
        ));
    }
}
