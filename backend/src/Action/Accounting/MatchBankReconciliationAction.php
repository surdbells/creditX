<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Infrastructure\Service\{ApiResponse, BankReconciliationService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Bank reconciliation matching endpoints:
 *   POST /api/accounting/bank-reconciliations/{id}/auto-match
 *   POST /api/accounting/bank-reconciliations/{id}/lines/{lineId}/match    { ledger_transaction_id }
 *   POST /api/accounting/bank-reconciliations/{id}/lines/{lineId}/unmatch
 *   POST /api/accounting/bank-reconciliations/{id}/complete
 *
 * Gated by reports.reconciliation. One action with a mode arg keeps the
 * matching lifecycle in a single place.
 */
final class MatchBankReconciliationAction
{
    use ApiResponse;

    public function __construct(private readonly BankReconciliationService $service) {}

    public function auto(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        try {
            $r = $this->service->autoMatch($args['id'] ?? '');
        } catch (\App\Domain\Exception\DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }
        return $this->success($r, "Auto-matched {$r['matched']} line(s); {$r['remaining']} unmatched");
    }

    public function match(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $b = (array) ($request->getParsedBody() ?? []);
        $txnId = (string) ($b['ledger_transaction_id'] ?? '');
        if ($txnId === '') return $this->error('ledger_transaction_id is required', 400);
        try {
            $line = $this->service->matchLine($args['id'] ?? '', $args['lineId'] ?? '', $txnId);
        } catch (\App\Domain\Exception\DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }
        return $this->success($line->toArray(), 'Line matched');
    }

    public function unmatch(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        try {
            $line = $this->service->unmatchLine($args['id'] ?? '', $args['lineId'] ?? '');
        } catch (\App\Domain\Exception\DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }
        return $this->success($line->toArray(), 'Line unmatched');
    }

    public function complete(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $userId = $request->getAttribute('user_id');
        try {
            $rec = $this->service->complete($args['id'] ?? '', $userId);
        } catch (\App\Domain\Exception\DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }
        return $this->success($rec->toArray(false), 'Reconciliation completed');
    }
}
