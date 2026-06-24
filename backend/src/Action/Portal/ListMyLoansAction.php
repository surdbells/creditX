<?php

declare(strict_types=1);

namespace App\Action\Portal;

use App\Domain\Repository\LoanRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * List the authenticated customer's own loans / applications (paginated).
 * The customerId filter is forced from the token, so a customer can never
 * see another customer's loans regardless of query params.
 */
final class ListMyLoansAction
{
    use ApiResponse;

    public function __construct(
        private readonly LoanRepository $loanRepo,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $customerId = (string) $request->getAttribute('customer_id');
        $params = $this->getPaginationParams($request->getQueryParams());

        $status = trim((string) ($request->getQueryParams()['status'] ?? '')) ?: null;

        $result = $this->loanRepo->paginated(
            $params['offset'], $params['per_page'], $params['sort_by'], $params['sort_dir'],
            $params['search'] ?: null, $status, null, null, null, $customerId,
        );

        $items = array_map(fn($l) => $l->toArray(), $result['items']);

        return $this->paginated($items, $result['total'], $params['page'], $params['per_page']);
    }
}
