<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Domain\Entity\GeneralLedger;
use App\Domain\Enum\AccountType;
use App\Domain\Enum\LedgerType;
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GL Reconciliation Report — for every parent GL that hosts
 * sub-ledgers (ledger_type = CUSTOMER), compare:
 *
 *   (a) Direct balance of the parent GL itself
 *       (sum of all LedgerTransactions where gl_id = parent AND
 *        customer_ledger_id IS NULL)
 *
 *   (b) Aggregate balance across all its child CustomerLedgers
 *       (sum of all LedgerTransactions where gl_id = parent AND
 *        customer_ledger_id IS NOT NULL)
 *
 *   (c) Combined balance
 *       (sum of all LedgerTransactions where gl_id = parent)
 *
 * In correct double-entry accounting:
 *   - For a CUBGL-type parent: the sub-ledger aggregate should
 *     equal the parent's total outstanding receivables.
 *   - Any direct posting to the parent GL without going through a
 *     child CustomerLedger (customer_ledger_id NULL) is a red flag.
 *     That's our discrepancy metric.
 *
 * Contract:
 *   GET /api/accounting/reconciliation
 *   Response:
 *     { status, data: { accounts: [...], summary: {...} } }
 *
 * Gated by accounting.view.
 *
 * Scope note: only CUSTOMER-type GLs are included. GENERAL-type GLs
 * don't have sub-ledgers by definition, so there's nothing to
 * reconcile — their balance IS authoritative.
 */
final class ReconciliationAction
{
    use ApiResponse;

    public function __construct(
        private readonly EntityManagerInterface $em,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $conn = $this->em->getConnection();

        // Fetch all CUSTOMER-type GLs (the parent GLs that host
        // sub-ledgers). Sorted by code for stable display ordering.
        $glAccounts = $this->em->createQueryBuilder()
            ->select('gl')
            ->from(GeneralLedger::class, 'gl')
            ->where('gl.ledgerType = :type')
            ->setParameter('type', LedgerType::CUSTOMER->value)
            ->orderBy('gl.accountCode', 'ASC')
            ->getQuery()->getResult();

        $accounts = [];
        $accountsWithDiscrepancy = 0;
        $totalDiscrepancy = '0.00';

        foreach ($glAccounts as $gl) {
            /** @var GeneralLedger $gl */
            $glId = $gl->getId();

            // Parent-only postings: customer_ledger_id IS NULL on this
            // GL. Any direct posting that bypasses a sub-ledger — e.g.
            // a manual journal or an orphaned reversal — lands here.
            $parentRow = $conn->executeQuery(
                'SELECT
                    COALESCE(SUM(CASE WHEN trans_type = \'DR\' THEN trans_amount ELSE 0 END), 0) AS total_dr,
                    COALESCE(SUM(CASE WHEN trans_type = \'CR\' THEN trans_amount ELSE 0 END), 0) AS total_cr
                 FROM ledger_transactions
                 WHERE gl_id = :glId AND customer_ledger_id IS NULL',
                ['glId' => $glId],
            )->fetchAssociative();

            // Sub-ledger postings: aggregate of every CustomerLedger
            // child rolled up via this parent GL. In a healthy system
            // this equals the outstanding portfolio on this GL.
            $subRow = $conn->executeQuery(
                'SELECT
                    COALESCE(SUM(CASE WHEN trans_type = \'DR\' THEN trans_amount ELSE 0 END), 0) AS total_dr,
                    COALESCE(SUM(CASE WHEN trans_type = \'CR\' THEN trans_amount ELSE 0 END), 0) AS total_cr,
                    COUNT(DISTINCT customer_ledger_id) AS subledger_count
                 FROM ledger_transactions
                 WHERE gl_id = :glId AND customer_ledger_id IS NOT NULL',
                ['glId' => $glId],
            )->fetchAssociative();

            $parentDr = (string) $parentRow['total_dr'];
            $parentCr = (string) $parentRow['total_cr'];
            $subDr    = (string) $subRow['total_dr'];
            $subCr    = (string) $subRow['total_cr'];

            $combinedDr = bcadd($parentDr, $subDr, 2);
            $combinedCr = bcadd($parentCr, $subCr, 2);

            $accountType = $gl->getAccountType();
            $parentBalance   = $this->balance($parentDr, $parentCr, $accountType);
            $subBalance      = $this->balance($subDr, $subCr, $accountType);
            $combinedBalance = $this->balance($combinedDr, $combinedCr, $accountType);

            // Discrepancy rule: parent-only balance should be zero.
            // A non-zero parent balance means someone posted directly
            // to the parent GL without a child ledger — an accounting
            // integrity concern that needs investigation.
            $parentAbs = $this->abs($parentBalance);
            $hasDiscrepancy = bccomp($parentAbs, '0.00', 2) !== 0;
            if ($hasDiscrepancy) {
                $accountsWithDiscrepancy++;
                $totalDiscrepancy = bcadd($totalDiscrepancy, $parentAbs, 2);
            }

            $accounts[] = [
                'id'                 => $glId,
                'code'               => $gl->getAccountCode(),
                'name'               => $gl->getAccountName(),
                'ledger_type'        => $gl->getLedgerType()->value,
                'account_type'       => $accountType->value,
                'parent_total_dr'    => $parentDr,
                'parent_total_cr'    => $parentCr,
                'parent_balance'     => $parentBalance,
                'subledger_total_dr' => $subDr,
                'subledger_total_cr' => $subCr,
                'subledger_balance'  => $subBalance,
                'subledger_count'    => (int) $subRow['subledger_count'],
                'combined_total_dr'  => $combinedDr,
                'combined_total_cr'  => $combinedCr,
                'combined_balance'   => $combinedBalance,
                'has_discrepancy'    => $hasDiscrepancy,
                'discrepancy_amount' => $parentAbs,
            ];
        }

        return $this->success([
            'accounts' => $accounts,
            'summary'  => [
                'accounts_checked'           => count($accounts),
                'accounts_with_discrepancy'  => $accountsWithDiscrepancy,
                'total_discrepancy_amount'   => $totalDiscrepancy,
                'generated_at'               => (new \DateTimeImmutable())->format('c'),
            ],
        ]);
    }

    /**
     * Compute signed balance for a GL given its account type.
     * Asset + Expense are DR-normal (balance = DR - CR).
     * Liability + Income + Equity are CR-normal (balance = CR - DR).
     */
    private function balance(string $dr, string $cr, AccountType $type): string
    {
        if ($type === AccountType::ASSET || $type === AccountType::EXPENSE) {
            return bcsub($dr, $cr, 2);
        }
        return bcsub($cr, $dr, 2);
    }

    /**
     * Absolute value for decimal strings. bcmath doesn't ship one and
     * built-in abs() forces float conversion which loses precision on
     * amounts near the decimal limit.
     */
    private function abs(string $n): string
    {
        return str_starts_with($n, '-') ? substr($n, 1) : $n;
    }
}
