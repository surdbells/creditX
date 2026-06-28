<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Infrastructure\Service\{ApiResponse, BankReconciliationService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GET /api/accounting/bank-reconciliations/{id}
 *
 * Full reconciliation view: session, statement lines, unmatched book
 * (GL) entries, and the reconciliation arithmetic. Gated by
 * reports.reconciliation.
 */
final class GetBankReconciliationAction
{
    use ApiResponse;

    public function __construct(private readonly BankReconciliationService $service) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        try {
            return $this->success($this->service->summary($args['id'] ?? ''));
        } catch (\App\Domain\Exception\DomainException $e) {
            return $this->notFound($e->getMessage());
        }
    }
}
