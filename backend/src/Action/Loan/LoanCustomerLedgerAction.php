<?php
declare(strict_types=1);
namespace App\Action\Loan;

use App\Domain\Repository\{LoanRepository, CustomerLedgerRepository, LedgerTransactionRepository};
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Loan customer-ledger endpoint.
 *
 * Fetches the CustomerLedger created for a given loan at disbursement
 * time, plus all LedgerTransaction entries posted against it. This
 * gives the loan-detail page a 'Ledger' tab showing the complete
 * accounting trail for the loan (gross loan CR, fee DRs, top-up B/F,
 * net disbursed DR, subsequent repayment postings, reversals).
 *
 * Returns 404 if the loan hasn't been disbursed yet (no CustomerLedger
 * exists until DisbursementService::disburse runs). The UI treats this
 * as a legitimate empty state, not an error — pre-disbursement loans
 * simply show 'No ledger yet — will be created on disbursement.'
 */
final class LoanCustomerLedgerAction
{
    use ApiResponse;

    public function __construct(
        private readonly LoanRepository $loanRepo,
        private readonly CustomerLedgerRepository $clRepo,
        private readonly LedgerTransactionRepository $txRepo,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $loan = $this->loanRepo->find($args['id'] ?? '');
        if ($loan === null) return $this->notFound('Loan not found');

        $ledger = $this->clRepo->findByLoan($loan->getId());
        if ($ledger === null) {
            // Legitimate pre-disbursement case. Return 200 with null so
            // the client can render an empty state rather than treating
            // this as an error.
            return $this->success([
                'ledger'       => null,
                'transactions' => [],
                'message'      => 'No ledger yet — it will be created when this loan is disbursed.',
            ]);
        }

        $transactions = $this->txRepo->findByCustomerLedger($ledger->getId());
        $items = array_map(fn($t) => $t->toArray(), $transactions);

        return $this->success([
            'ledger'       => $ledger->toArray(),
            'transactions' => $items,
        ]);
    }
}
