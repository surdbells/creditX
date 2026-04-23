<?php
declare(strict_types=1);
namespace App\Action\Report;

use App\Domain\Entity\GeneralLedger;
use App\Domain\Enum\AccountType;
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Income Statement (Profit & Loss) — revenue and expenses over a
 * specified date range, with Net Income = Revenue − Expenses.
 *
 * Contract:
 *   GET /api/reports/income-statement?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 *   Both dates are INCLUSIVE. Missing 'from' defaults to the first
 *   day of the current month; missing 'to' defaults to today.
 *
 *   Response:
 *     { status, data: {
 *         period: { from, to, label },
 *         revenue: {
 *           accounts: [ { id, code, name, total_dr, total_cr, balance } ],
 *           total: string,
 *         },
 *         expenses: {
 *           accounts: [...],
 *           total: string,
 *         },
 *         net_income: string,         // revenue.total - expenses.total
 *         generated_at: ISO,
 *     } }
 *
 * Balance computation (per account):
 *   - Income accounts are CR-normal: balance = sum(CR) - sum(DR).
 *     Refunds or reversals post as DR and reduce revenue.
 *   - Expense accounts are DR-normal: balance = sum(DR) - sum(CR).
 *     Vendor refunds post as CR and reduce expense.
 *
 * Only accounts WITH activity in the period are included in the
 * listings. A chart of accounts typically has many 'unused' accounts
 * that would clutter the report without adding information.
 *
 * Gated by accounting.view.
 */
final class IncomeStatementAction
{
    use ApiResponse;

    public function __construct(
        private readonly EntityManagerInterface $em,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $params = $request->getQueryParams();
        $from = $this->sanitizeDate($params['from'] ?? null, date('Y-m-01'));
        $to   = $this->sanitizeDate($params['to'] ?? null, date('Y-m-d'));

        // Guard: 'from' must be <= 'to' — swap if inverted to be forgiving.
        // A user who typed the range backwards still gets useful output.
        if (strcmp($from, $to) > 0) {
            [$from, $to] = [$to, $from];
        }

        $revenue = $this->accountsOfType(AccountType::INCOME, $from, $to);
        $expenses = $this->accountsOfType(AccountType::EXPENSE, $from, $to);

        $netIncome = bcsub($revenue['total'], $expenses['total'], 2);

        return $this->success([
            'period' => [
                'from'  => $from,
                'to'    => $to,
                'label' => $this->periodLabel($from, $to),
            ],
            'revenue'  => $revenue,
            'expenses' => $expenses,
            'net_income'   => $netIncome,
            'generated_at' => (new \DateTimeImmutable())->format('c'),
        ]);
    }

    /**
     * Fetch every GL account of the given type that had at least one
     * posting within [from, to]. Computes per-account DR/CR totals
     * and signed balance. Accounts without activity are omitted from
     * the listing but contribute zero to the total.
     *
     * Returns: { accounts: [...], total: string }
     */
    private function accountsOfType(AccountType $type, string $from, string $to): array
    {
        $conn = $this->em->getConnection();

        // Sub-select gets the per-account DR/CR totals within the
        // date range. We join against general_ledger to keep accounts
        // that have never posted out of the listing.
        $sql = "
            SELECT
                gl.id,
                gl.account_code AS code,
                gl.account_name AS name,
                COALESCE(SUM(CASE WHEN t.trans_type = 'DR' THEN t.trans_amount ELSE 0 END), 0) AS total_dr,
                COALESCE(SUM(CASE WHEN t.trans_type = 'CR' THEN t.trans_amount ELSE 0 END), 0) AS total_cr
            FROM general_ledger gl
            INNER JOIN ledger_transactions t ON t.gl_id = gl.id
            WHERE gl.account_type = :type
              AND CONCAT(t.trans_year, '-', t.trans_month, '-', t.trans_day) >= :fromDate
              AND CONCAT(t.trans_year, '-', t.trans_month, '-', t.trans_day) <= :toDate
            GROUP BY gl.id, gl.account_code, gl.account_name
            ORDER BY gl.account_code ASC
        ";

        $rows = $conn->executeQuery(
            $sql,
            ['type' => $type->value, 'fromDate' => $from, 'toDate' => $to],
        )->fetchAllAssociative();

        // Compute per-account balance using the account type's natural side.
        // Income is CR-normal (balance = CR - DR); Expense is DR-normal.
        $isDebitNormal = ($type === AccountType::EXPENSE);
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

    /**
     * Ensure the supplied date is in YYYY-MM-DD format. Falls back to
     * the default if invalid (common when the query param is missing
     * or malformed).
     */
    private function sanitizeDate(?string $input, string $default): string
    {
        if ($input === null || $input === '') return $default;
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $input) === 1) {
            return $input;
        }
        return $default;
    }

    /**
     * Format a period label like 'January 2026' for a single-month
     * range, or 'Jan 1–Mar 15, 2026' for a cross-month range.
     * Used by the frontend header without needing to reformat there.
     */
    private function periodLabel(string $from, string $to): string
    {
        $f = new \DateTimeImmutable($from);
        $t = new \DateTimeImmutable($to);
        // Full month: first-of-month to last-of-month
        if ($f->format('d') === '01' && $t->format('d') === $t->format('t')
            && $f->format('Y-m') === $t->format('Y-m')) {
            return $f->format('F Y');
        }
        if ($f->format('Y') === $t->format('Y')) {
            return $f->format('M j') . '–' . $t->format('M j, Y');
        }
        return $f->format('M j, Y') . ' – ' . $t->format('M j, Y');
    }
}
