<?php
declare(strict_types=1);
namespace App\Action\Deposit;

use App\Domain\Repository\{DepositAccountRepository, DepositTransactionRepository};
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GET /api/deposits/accounts/{id}/statement — paginated statement lines.
 * Optional from / to (YYYY-MM-DD) query filters. Gated by deposits.view.
 */
final class DepositAccountStatementAction
{
    use ApiResponse;

    public function __construct(
        private readonly DepositAccountRepository $accountRepo,
        private readonly DepositTransactionRepository $txnRepo,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $account = $this->accountRepo->find($args['id'] ?? '');
        if ($account === null) return $this->notFound('Deposit account not found');

        $params = $request->getQueryParams();
        $p = $this->getPaginationParams($params);
        $from = !empty($params['from']) ? (string) $params['from'] : null;
        $to   = !empty($params['to'])   ? (string) $params['to']   : null;

        $result = $this->txnRepo->forAccount($account->getId(), $p['offset'], $p['per_page'], $from, $to);
        $items = array_map(fn($t) => $t->toArray(), $result['items']);

        return $this->json([
            'status'  => 'success',
            'message' => 'Success',
            'data'    => $items,
            'account' => $account->toArray(),
            'meta'    => [
                'total'       => $result['total'],
                'page'        => $p['page'],
                'per_page'    => $p['per_page'],
                'total_pages' => (int) ceil($result['total'] / max($p['per_page'], 1)),
            ],
        ]);
    }
}
