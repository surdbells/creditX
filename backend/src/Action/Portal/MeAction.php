<?php

declare(strict_types=1);

namespace App\Action\Portal;

use App\Domain\Repository\CustomerRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Return the authenticated customer's own profile. customer_id is supplied by
 * CustomerAuthMiddleware from the validated portal token.
 */
final class MeAction
{
    use ApiResponse;

    public function __construct(
        private readonly CustomerRepository $customerRepo,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $customerId = (string) $request->getAttribute('customer_id');
        $customer = $this->customerRepo->find($customerId);

        if ($customer === null) {
            return $this->notFound('Account not found');
        }

        return $this->success($customer->toArray(true));
    }
}
