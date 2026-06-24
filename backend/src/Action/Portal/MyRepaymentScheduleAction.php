<?php

declare(strict_types=1);

namespace App\Action\Portal;

use App\Domain\Repository\{LoanRepository, RepaymentScheduleRepository};
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Return the repayment schedule for a loan the authenticated customer owns.
 * Ownership is verified before any schedule rows are returned.
 */
final class MyRepaymentScheduleAction
{
    use ApiResponse;

    public function __construct(
        private readonly LoanRepository $loanRepo,
        private readonly RepaymentScheduleRepository $scheduleRepo,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $customerId = (string) $request->getAttribute('customer_id');
        $loanId = $args['id'] ?? '';
        $loan = $this->loanRepo->find($loanId);

        if ($loan === null || $loan->getCustomer()->getId() !== $customerId) {
            return $this->notFound('Loan not found');
        }

        $schedules = $this->scheduleRepo->findByLoan($loanId);
        return $this->success(array_map(fn($s) => $s->toArray(), $schedules));
    }
}
