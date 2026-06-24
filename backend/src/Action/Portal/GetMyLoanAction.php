<?php

declare(strict_types=1);

namespace App\Action\Portal;

use App\Domain\Repository\LoanRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Fetch a single loan owned by the authenticated customer. Ownership is
 * enforced by comparing the loan's customer id against the token's
 * customer_id — a mismatch returns 404 (not 403) so the endpoint does not
 * reveal whether a loan id exists for another customer.
 */
final class GetMyLoanAction
{
    use ApiResponse;

    public function __construct(
        private readonly LoanRepository $loanRepo,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $customerId = (string) $request->getAttribute('customer_id');
        $loan = $this->loanRepo->find($args['id'] ?? '');

        if ($loan === null || $loan->getCustomer()->getId() !== $customerId) {
            return $this->notFound('Loan not found');
        }

        return $this->success($loan->toArray(true));
    }
}
