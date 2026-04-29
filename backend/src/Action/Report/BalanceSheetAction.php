<?php
declare(strict_types=1);
namespace App\Action\Report;

use App\Domain\Enum\AccountType;
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Balance Sheet — Assets, Liabilities, Equity snapshot as of a
 * specified date, with the fundamental accounting equation check:
 *
 *     Assets = Liabilities + Equity
 *
 * Contract:
 *   GET /api/reports/balance-sheet?as_of=YYYY-MM-DD
 *
 *   'as_of' is INCLUSIVE (counts every posting through end-of-day
 *   on the given date). Missing as_of defaults to today.
 *
 *   Response:
 *     { status, data: {
 *         as_of: 'YYYY-MM-DD',
 *         assets: {
 *           accounts: [ { id, code, name, total_dr, total_cr, balance } ],
 *           total: string,
 *         },
 *         liabilities: { accounts: [...], total },
 *         equity: {
 *           accounts: [...],            // Equity GL accounts
 *           retained_earnings: string,  // computed income - expense
 *                                       // from beginning of time to as_of
 *           total: string,              // sum(equity accounts) + retained
 *         },
 *         accounting_equation: {
 *           assets_total: string,
 *           liabilities_plus_equity: string,
 *           difference: string,         // assets - (L + E); should be 0
 *           is_balanced: bool,
 *         },
 *         generated_at: ISO,
 *     } }
 *
 * Balance computation per account:
 *   - Asset (DR-normal): balance = sum(DR) - sum(CR)
 *   - Liability (CR-normal): balance = sum(CR) - sum(DR)
 *   - Equity (CR-normal): balance = sum(CR) - sum(DR)
 *
 * Retained Earnings:
 *   Cumulative net income from the earliest ledger entry up to as_of.
 *   This is a 'soft' RE calculation — it does NOT reflect closing
 *   journals moving income/expense to an equity account (which is
 *   what a formal month-end close would do; that's commit AF). Until
 *   AF ships, RE is computed on the fly here.
 *
 * The equation check rounds to 2dp via bccomp — accepting diffs under
 * ₦0.01 as balanced to account for rounding in intermediate fee calcs.
 * Anything above 1 kobo signals a real integrity issue.
 *
 * Gated by accounting.view.
 */
final class BalanceSheetAction
{
    use ApiResponse;

    public function __construct(
        private readonly EntityManagerInterface $em,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $params = $request->getQueryParams();
        $asOf = $this->sanitizeDate($params['as_of'] ?? null, date('Y-m-d'));

        $assets      = $this->accountsOfType(AccountType::ASSET, $asOf);
        $liabilities = $this->accountsOfType(AccountType::LIABILITY, $asOf);
        $equityAccts = $this->accountsOfType(AccountType::EQUITY, $asOf);

        // Retained Earnings on the BS is computed as cumulative
        // income − expense through asOf. This works correctly with
        // both closed and unclosed periods because:
        //
        //   - For a closed period: the closing journal posts DR each
        //     income account + CR Retained Earnings (and the mirror
        //     for expenses). The DRs cancel the original CRs within
        //     the cumulative sum, so accountsOfType(INCOME) returns
        //     ONLY the unclosed activity. The closed activity is
        //     reflected in the RETEARN equity account balance instead
        //     (already counted in $equityAccts).
        //
        //   - For an unclosed period: the income/expense GLs hold
        //     the full activity (no offsetting close DRs/CRs yet),
        //     RETEARN GL balance is zero for that period, and the
        //     computed RE picks up the full net income. No double-
        //     count because no close has happened.
        //
        // Net result: equityTotal correctly reflects all retained
        // earnings (closed + unclosed) without double-counting.
        $incomeThroughAsOf  = $this->accountsOfType(AccountType::INCOME,  $asOf);
        $expenseThroughAsOf = $this->accountsOfType(AccountType::EXPENSE, $asOf);
        $retainedEarnings = bcsub($incomeThroughAsOf['total'], $expenseThroughAsOf['total'], 2);

        $equityTotal = bcadd($equityAccts['total'], $retainedEarnings, 2);

        $assetsTotal = $assets['total'];
        $lPlusE = bcadd($liabilities['total'], $equityTotal, 2);
        $diff = bcsub($assetsTotal, $lPlusE, 2);

        // Balanced within 1 kobo. Anything larger is a real discrepancy.
        $isBalanced = bccomp($this->abs($diff), '0.01', 2) <= 0;

        return $this->success([
            'as_of'        => $asOf,
            'assets'       => $assets,
            'liabilities'  => $liabilities,
            'equity'       => [
                'accounts'          => $equityAccts['accounts'],
                'retained_earnings' => $retainedEarnings,
                'total'             => $equityTotal,
            ],
            'accounting_equation' => [
                'assets_total'             => $assetsTotal,
                'liabilities_plus_equity'  => $lPlusE,
                'difference'               => $diff,
                'is_balanced'              => $isBalanced,
            ],
            'generated_at' => (new \DateTimeImmutable())->format('c'),
        ]);
    }

    /**
     * Balance sheet version: sum every posting from the beginning of
     * time up through as_of (inclusive). Only accounts with at least
     * one posting show up in the listing; total reflects every row
     * regardless.
     *
     * Returns: { accounts: [...], total: string }
     */
    private function accountsOfType(AccountType $type, string $asOf): array
    {
        $conn = $this->em->getConnection();

        $sql = "
            SELECT
                gl.id,
                gl.account_code AS code,
                gl.account_name AS name,
                COALESCE(SUM(CASE WHEN t.trans_type = 'DR' THEN t.trans_amount ELSE 0 END), 0) AS total_dr,
                COALESCE(SUM(CASE WHEN t.trans_type = 'CR' THEN t.trans_amount ELSE 0 END), 0) AS total_cr
            FROM general_ledgers gl
            INNER JOIN ledger_transactions t ON t.gl_id = gl.id
            WHERE gl.account_type = :type
              AND t.posting_date <= :asOf
            GROUP BY gl.id, gl.account_code, gl.account_name
            ORDER BY gl.account_code ASC
        ";

        $rows = $conn->executeQuery(
            $sql,
            ['type' => $type->value, 'asOf' => $asOf],
        )->fetchAllAssociative();

        $isDebitNormal = ($type === AccountType::ASSET || $type === AccountType::EXPENSE);
        $total = '0.00';
        $accounts = [];
        foreach ($rows as $r) {
            $dr = (string) $r['total_dr'];
            $cr = (string) $r['total_cr'];
            $balance = $isDebitNormal
                ? bcsub($dr, $cr, 2)
                : bcsub($cr, $dr, 2);
            $accounts[] = [
                'id'       => $r['id'],
                'code'     => $r['code'],
                'name'     => $r['name'],
                'total_dr' => $dr,
                'total_cr' => $cr,
                'balance'  => $balance,
            ];
            $total = bcadd($total, $balance, 2);
        }

        return ['accounts' => $accounts, 'total' => $total];
    }

    private function sanitizeDate(?string $input, string $default): string
    {
        if ($input === null || $input === '') return $default;
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $input) === 1) {
            return $input;
        }
        return $default;
    }

    /** Absolute value for decimal strings — bcmath has no bcabs. */
    private function abs(string $n): string
    {
        return str_starts_with($n, '-') ? substr($n, 1) : $n;
    }
}
