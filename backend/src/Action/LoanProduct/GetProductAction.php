<?php
declare(strict_types=1);
namespace App\Action\LoanProduct;

use App\Domain\Repository\LoanProductRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class GetProductAction
{
    use ApiResponse;
    public function __construct(private readonly LoanProductRepository $repo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $product = $this->repo->find($args['id'] ?? '');
        if ($product === null) return $this->notFound('Loan product not found');
        return $this->success($product->toArray(true));
    }
}
