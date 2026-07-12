<?php
declare(strict_types=1);
namespace App\Action\Settlement;

use App\Domain\Repository\SettlementRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GET /api/loans/{id}/settlement — the latest settlement (any status) for a
 * loan, so the loan detail can show settlement status and offer retry.
 * Returns null data when the loan has never been settled.
 */
final class GetLoanSettlementAction
{
    use ApiResponse;

    public function __construct(private readonly SettlementRepository $repo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $settlement = $this->repo->findLatestForLoan($args['id'] ?? '');
        return $this->success($settlement?->toArray());
    }
}
