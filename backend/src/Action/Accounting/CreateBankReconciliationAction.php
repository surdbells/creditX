<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Infrastructure\Service\{ApiResponse, BankReconciliationService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * POST /api/accounting/bank-reconciliations
 * Body: { gl_code?, statement_date, opening_balance, closing_balance }
 *
 * Start a bank reconciliation session for a bank/cash GL as of a statement
 * date. Gated by reports.reconciliation.
 */
final class CreateBankReconciliationAction
{
    use ApiResponse;

    public function __construct(private readonly BankReconciliationService $service) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $userId = $request->getAttribute('user_id');
        if ($userId === null) return $this->unauthorized();

        $b = (array) ($request->getParsedBody() ?? []);
        try {
            $rec = $this->service->create(
                (string) ($b['gl_code'] ?? 'BANK'),
                (string) ($b['statement_date'] ?? date('Y-m-d')),
                (string) ($b['opening_balance'] ?? '0'),
                (string) ($b['closing_balance'] ?? '0'),
                $userId,
            );
        } catch (\App\Domain\Exception\DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }
        return $this->created($rec->toArray(false), 'Bank reconciliation started');
    }
}
