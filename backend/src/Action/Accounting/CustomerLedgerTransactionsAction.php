<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Domain\Repository\{CustomerLedgerRepository, LedgerTransactionRepository};
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class CustomerLedgerTransactionsAction
{
    use ApiResponse;
    public function __construct(
        private readonly CustomerLedgerRepository $clRepo,
        private readonly LedgerTransactionRepository $txRepo,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $cl = $this->clRepo->find($args['id'] ?? '');
        if ($cl === null) return $this->notFound('Customer ledger not found');

        $transactions = $this->txRepo->findByCustomerLedger($cl->getId());
        $items = array_map(fn($t) => $t->toArray(), $transactions);

        return $this->success(['ledger' => $cl->toArray(), 'transactions' => $items]);
    }
}
