<?php
declare(strict_types=1);
namespace App\Action\Investment;

use App\Domain\Repository\InvestmentProductRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/** GET /api/investments/products/{id}. Gated by investments.view. */
final class GetInvestmentProductAction
{
    use ApiResponse;

    public function __construct(private readonly InvestmentProductRepository $repo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $p = $this->repo->find($args['id'] ?? '');
        if ($p === null) return $this->notFound('Investment product not found');
        return $this->success($p->toArray());
    }
}
