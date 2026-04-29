<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Infrastructure\Service\ApiResponse;
use App\Infrastructure\Service\GlReconciliationService;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GL Reconciliation Report — for every parent GL that hosts
 * sub-ledgers (ledger_type = CUSTOMER), compare:
 *
 *   (a) Direct balance of the parent GL itself
 *       (sum of all LedgerTransactions where gl_id = parent AND
 *        customer_ledger_id IS NULL)
 *
 *   (b) Aggregate balance across all its child CustomerLedgers
 *       (sum of all LedgerTransactions where gl_id = parent AND
 *        customer_ledger_id IS NOT NULL)
 *
 *   (c) Combined balance
 *       (sum of all LedgerTransactions where gl_id = parent)
 *
 * In correct double-entry accounting:
 *   - For a CUBGL-type parent: the sub-ledger aggregate should
 *     equal the parent's total outstanding receivables.
 *   - Any direct posting to the parent GL without going through a
 *     child CustomerLedger (customer_ledger_id NULL) is a red flag.
 *     That's our discrepancy metric.
 *
 * Contract:
 *   GET /api/accounting/reconciliation
 *   Response:
 *     { status, data: { accounts: [...], summary: {...} } }
 *
 * Gated by accounting.view.
 *
 * Implementation: delegates to GlReconciliationService::scan().
 * The service is also called from a daily scheduled CLI worker
 * (bin/run-gl-reconciliation.php) that persists runs and dispatches
 * alerts when discrepancies exceed a threshold. This action stays
 * ephemeral — every call recomputes from scratch, no DB writes.
 *
 * Scope note: only CUSTOMER-type GLs are included. GENERAL-type GLs
 * don't have sub-ledgers by definition, so there's nothing to
 * reconcile — their balance IS authoritative.
 */
final class ReconciliationAction
{
    use ApiResponse;

    public function __construct(
        private readonly GlReconciliationService $reconService,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return $this->success($this->reconService->scan());
    }
}
