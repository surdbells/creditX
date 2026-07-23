<?php
declare(strict_types=1);
namespace App\Action\CreditBureau;

use App\Domain\Repository\CreditCheckRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GET /api/loans/{id}/credit-check — the latest credit check for a loan, so
 * the approval-queue reviewer (and loan detail) can see the score/band when a
 * credit-check step was left for manual review. Null data if none.
 */
final class GetLoanCreditCheckAction
{
    use ApiResponse;

    public function __construct(private readonly CreditCheckRepository $repo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $check = $this->repo->findLatestForLoan($args['id'] ?? '');
        return $this->success($check?->toArray());
    }
}
