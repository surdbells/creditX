<?php
declare(strict_types=1);
namespace App\Action\Investment;

use App\Domain\Repository\InvestmentRepository;
use App\Infrastructure\Service\{ApiResponse, InvestmentService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GET /api/investments/{id} — one investment with its performance block.
 * Gated by investments.view.
 */
final class GetInvestmentAction
{
    use ApiResponse;

    public function __construct(
        private readonly InvestmentRepository $repo,
        private readonly InvestmentService $service,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $inv = $this->repo->find($args['id'] ?? '');
        if ($inv === null) return $this->notFound('Investment not found');

        return $this->success($inv->toArray() + ['performance' => $this->service->performance($inv)]);
    }
}
