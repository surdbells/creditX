<?php

declare(strict_types=1);

namespace App\Action\Invest;

use App\Domain\Repository\{InvestmentRepository, InvestmentTransactionRepository};
use App\Infrastructure\Service\{ApiResponse, InvestmentService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GET /api/invest/investments/{id} — one of the authenticated investor's own
 * investments, with performance and full statement.
 *
 * Ownership is re-checked against the token's customer id: requesting another
 * investor's id returns 404 (not 403 — we don't confirm the record exists).
 */
final class GetMyInvestmentAction
{
    use ApiResponse;

    public function __construct(
        private readonly InvestmentRepository $repo,
        private readonly InvestmentTransactionRepository $txnRepo,
        private readonly InvestmentService $service,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $customerId = (string) $request->getAttribute('customer_id');
        $inv = $this->repo->find($args['id'] ?? '');

        if ($inv === null || $inv->getCustomer()->getId() !== $customerId) {
            return $this->notFound('Investment not found');
        }

        return $this->success([
            'investment'   => $inv->toArray(),
            'performance'  => $this->service->performance($inv),
            'transactions' => array_map(fn($t) => $t->toArray(), $this->txnRepo->forInvestment($inv->getId())),
        ]);
    }
}
