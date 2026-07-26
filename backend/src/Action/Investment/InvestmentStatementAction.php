<?php
declare(strict_types=1);
namespace App\Action\Investment;

use App\Domain\Repository\{InvestmentRepository, InvestmentTransactionRepository};
use App\Infrastructure\Service\{ApiResponse, InvestmentService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GET /api/investments/{id}/statement — every movement on an investment,
 * oldest first, with the performance summary. Gated by investments.view.
 */
final class InvestmentStatementAction
{
    use ApiResponse;

    public function __construct(
        private readonly InvestmentRepository $repo,
        private readonly InvestmentTransactionRepository $txnRepo,
        private readonly InvestmentService $service,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $inv = $this->repo->find($args['id'] ?? '');
        if ($inv === null) return $this->notFound('Investment not found');

        $txns = $this->txnRepo->forInvestment($inv->getId());
        return $this->success([
            'investment'   => $inv->toArray(),
            'performance'  => $this->service->performance($inv),
            'transactions' => array_map(fn($t) => $t->toArray(), $txns),
        ]);
    }
}
