<?php
declare(strict_types=1);
namespace App\Action\Report;

use App\Domain\Entity\Budget;
use App\Domain\Enum\AccountType;
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Budget vs Actual Report — compares budgeted amounts against actual
 * posted activity for a given year+month. Includes variance and
 * variance percentage per account.
 *
 * Contract:
 *   GET /api/reports/budget-vs-actual?year=YYYY&month=MM
 *
 * Response:
 *   { status, data: {
 *       year, month, period_label,
 *       income: { rows: [...], totals: {budget, actual, variance, variance_pct} },
 *       expense: { rows: [...], totals: {...} },
 *       summary: {
 *         net_budget_income,   // budgeted income - budgeted expense
 *         net_actual_income,   // actual income - actual expense
 *         net_variance,        // actual - budget
 *       },
 *       generated_at,
 *     } }
 *
 * Variance semantics:
 *   - Income: positive variance is GOOD (exceeded revenue target)
 *   - Expense: positive variance is BAD (overspent)
 *
 * Rows include every account that has either a budget OR activity
 * for the period — so accounts with no budget but some actual show
 * up as 'Unbudgeted' (budget=0, actual>0, variance_pct=∞).
 *
 * Gated by accounting.view.
 */
final class BudgetVsActualAction
{
    use ApiResponse;

    public function __construct(private readonly EntityManagerInterface $em) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $params = $request->getQueryParams();
        $year = (string) ($params['year'] ?? date('Y'));
        $month = str_pad((string) ($params['month'] ?? date('m')), 2, '0', STR_PAD_LEFT);

        if (!preg_match('/^\d{4}$/', $year) || (int)$month < 1 || (int)$month > 12) {
            return $this->validationError(['year' => 'YYYY required', 'month' => '01-12 required']);
        }

        // Period bounds: first to last day of the target month
        $fromDate = "{$year}-{$month}-01";
        $toDate = (new \DateTimeImmutable($fromDate))
            ->modify('last day of this month')
            ->format('Y-m-d');

        $income = $this->compareByType(AccountType::INCOME, $year, $month, $fromDate, $toDate);
        $expense = $this->compareByType(AccountType::EXPENSE, $year, $month, $fromDate, $toDate);

        $netBudget = bcsub($income['totals']['budget'], $expense['totals']['budget'], 2);
        $netActual = bcsub($income['totals']['actual'], $expense['totals']['actual'], 2);
        $netVariance = bcsub($netActual, $netBudget, 2);

        return $this->success([
            'year'          => $year,
            'month'         => $month,
            'period_label'  => (new \DateTimeImmutable($fromDate))->format('F Y'),
            'income'        => $income,
            'expense'       => $expense,
            'summary'       => [
                'net_budget_income' => $netBudget,
                'net_actual_income' => $netActual,
                'net_variance'      => $netVariance,
            ],
            'generated_at'  => (new \DateTimeImmutable())->format('c'),
        ]);
    }

    /**
     * Build comparison rows for a given account type. Strategy:
     *   1. Get all budgeted rows for the period (gl_id → budget_amount)
     *   2. Get all actual rows for the period (gl_id → actual balance)
     *   3. Union the key sets (accounts with either budget or actual)
     *   4. Compute variance + percentage per row
     *   5. Sort by actual DESC so highest-activity accounts show first
     */
    private function compareByType(AccountType $type, string $year, string $month, string $from, string $to): array
    {
        $conn = $this->em->getConnection();
        $isDebitNormal = ($type === AccountType::EXPENSE);

        // Budgeted amounts
        $budgetSql = "
            SELECT b.gl_id, CAST(b.amount AS NUMERIC) AS budget
            FROM budgets b
            INNER JOIN general_ledger gl ON gl.id = b.gl_id
            WHERE gl.account_type = :type AND b.year = :year AND b.month = :month
        ";
        $budgetRows = $conn->executeQuery($budgetSql, [
            'type' => $type->value, 'year' => $year, 'month' => $month,
        ])->fetchAllAssociative();
        $budgetMap = [];
        foreach ($budgetRows as $r) {
            $budgetMap[$r['gl_id']] = (string) $r['budget'];
        }

        // Actual activity
        $actualSql = "
            SELECT
                gl.id AS gl_id,
                gl.account_code,
                gl.account_name,
                COALESCE(SUM(CASE WHEN t.trans_type = 'DR' THEN t.trans_amount ELSE 0 END), 0) AS dr,
                COALESCE(SUM(CASE WHEN t.trans_type = 'CR' THEN t.trans_amount ELSE 0 END), 0) AS cr
            FROM general_ledger gl
            INNER JOIN ledger_transactions t ON t.gl_id = gl.id
            WHERE gl.account_type = :type
              AND CONCAT(t.trans_year, '-', t.trans_month, '-', t.trans_day) >= :fromDate
              AND CONCAT(t.trans_year, '-', t.trans_month, '-', t.trans_day) <= :toDate
            GROUP BY gl.id, gl.account_code, gl.account_name
        ";
        $actualRows = $conn->executeQuery($actualSql, [
            'type' => $type->value, 'fromDate' => $from, 'toDate' => $to,
        ])->fetchAllAssociative();
        $actualMap = [];
        $glInfo = [];
        foreach ($actualRows as $r) {
            $dr = (string) $r['dr'];
            $cr = (string) $r['cr'];
            $balance = $isDebitNormal ? bcsub($dr, $cr, 2) : bcsub($cr, $dr, 2);
            $actualMap[$r['gl_id']] = $balance;
            $glInfo[$r['gl_id']] = [
                'code' => $r['account_code'],
                'name' => $r['account_name'],
            ];
        }

        // For budgeted-but-no-activity accounts we still need the GL
        // metadata. Fetch for any gl_ids present in budgetMap not in
        // glInfo.
        $missing = array_diff(array_keys($budgetMap), array_keys($glInfo));
        if (!empty($missing)) {
            $placeholders = implode(',', array_fill(0, count($missing), '?'));
            $rows = $conn->executeQuery(
                "SELECT id, account_code, account_name FROM general_ledger WHERE id IN ($placeholders)",
                array_values($missing),
            )->fetchAllAssociative();
            foreach ($rows as $r) {
                $glInfo[$r['id']] = ['code' => $r['account_code'], 'name' => $r['account_name']];
            }
        }

        // Build rows + running totals
        $allGlIds = array_unique(array_merge(array_keys($budgetMap), array_keys($actualMap)));
        $rows = [];
        $totalBudget = '0.00';
        $totalActual = '0.00';
        foreach ($allGlIds as $glId) {
            $budget = $budgetMap[$glId] ?? '0.00';
            $actual = $actualMap[$glId] ?? '0.00';
            $variance = bcsub($actual, $budget, 2);
            $variancePct = bccomp($budget, '0.00', 2) > 0
                ? round(((float) $variance / (float) $budget) * 100, 2)
                : null; // null = 'Unbudgeted' / no baseline

            $rows[] = [
                'gl_id'          => $glId,
                'gl_code'        => $glInfo[$glId]['code'] ?? '??',
                'gl_name'        => $glInfo[$glId]['name'] ?? 'Unknown',
                'budget'         => $budget,
                'actual'         => $actual,
                'variance'       => $variance,
                'variance_pct'   => $variancePct,
                'has_budget'     => isset($budgetMap[$glId]),
            ];
            $totalBudget = bcadd($totalBudget, $budget, 2);
            $totalActual = bcadd($totalActual, $actual, 2);
        }

        // Sort by actual DESC — highest-activity accounts first
        usort($rows, fn($a, $b) => bccomp($b['actual'], $a['actual'], 2));

        $totalVariance = bcsub($totalActual, $totalBudget, 2);
        $totalVariancePct = bccomp($totalBudget, '0.00', 2) > 0
            ? round(((float) $totalVariance / (float) $totalBudget) * 100, 2)
            : null;

        return [
            'rows'   => $rows,
            'totals' => [
                'budget'       => $totalBudget,
                'actual'       => $totalActual,
                'variance'     => $totalVariance,
                'variance_pct' => $totalVariancePct,
            ],
        ];
    }
}
