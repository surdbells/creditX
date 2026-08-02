<?php

declare(strict_types=1);

namespace App\Action\Portal;

use App\Domain\Enum\LoanStatus;
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

        $status = $this->parseStatuses((string) ($request->getQueryParams()['status'] ?? ''));

        $result = $this->loanRepo->paginated(
            $params['offset'], $params['per_page'], $params['sort_by'], $params['sort_dir'],
            $params['search'] ?: null, $status, null, null, null, $customerId,
        );

        $items = array_map(fn($l) => $l->toArray(), $result['items']);

        return $this->paginated($items, $result['total'], $params['page'], $params['per_page']);
    }

    /**
     * A portal filter tab maps to a SET of statuses, so `status` is accepted as
     * a comma-separated list. Values are lower-cased (the enum is stored
     * lowercase; matching only worked before because MySQL collates
     * case-insensitively) and anything not a real LoanStatus is dropped, so a
     * hand-edited query string can never reach the query.
     *
     * @return string[]|null
     */
    private function parseStatuses(string $raw): ?array
    {
        $wanted = array_filter(array_map(
            static fn(string $s) => strtolower(trim($s)),
            explode(',', $raw),
        ));
        $valid = array_values(array_filter(
            $wanted,
            static fn(string $s) => LoanStatus::tryFrom($s) !== null,
        ));

        return $valid === [] ? null : $valid;
    }
}
