<?php

declare(strict_types=1);

namespace App\Action\Portal;

use App\Domain\Repository\LoanProductRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * List the active loan products a customer can apply for from the portal.
 * Only active products are returned; inactive ones are never offered.
 */
final class ListProductsAction
{
    use ApiResponse;

    public function __construct(
        private readonly LoanProductRepository $productRepo,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $products = $this->productRepo->findActive();
        return $this->success(array_map(fn($p) => $p->toArray(true), $products));
    }
}
