<?php
declare(strict_types=1);
namespace App\Action\Deposit;

use App\Domain\Repository\DepositProductRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/** GET /api/deposits/products/{id} — fetch one product. Gated by deposits.view. */
final class GetDepositProductAction
{
    use ApiResponse;
    public function __construct(private readonly DepositProductRepository $repo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $p = $this->repo->find($args['id'] ?? '');
        if ($p === null) return $this->notFound('Deposit product not found');
        return $this->success($p->toArray());
    }
}
