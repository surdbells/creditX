<?php

declare(strict_types=1);

namespace App\Action\Invest;

use App\Domain\Repository\CustomerRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/** GET /api/invest/me — the signed-in investor's own profile. */
final class MeAction
{
    use ApiResponse;

    public function __construct(private readonly CustomerRepository $customerRepo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $customer = $this->customerRepo->find((string) $request->getAttribute('investor_id'));
        if ($customer === null) {
            return $this->notFound('Investor not found');
        }
        return $this->success($customer->toArray());
    }
}
