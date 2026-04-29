<?php
declare(strict_types=1);
namespace App\Action\Report;

use App\Domain\Enum\AccountType;
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Statement of Cash Flows — IAS 7 indirect method.
 *
 * Reports the change in the lender's cash position over a period,
 * reconciling net income to actual cash movement by adjusting for
 * non-cash items and working-capital changes.
 *
 * Contract:
 *   GET /api/reports/statement-of-cash-flows?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 *   Both dates INCLUSIVE. Defaults: from=first-of-current-month,
 *   to=today.
 *
 *   Response:
 *     { status, data: {
 *         period: { from, to, label },
 *         operating: {
 *           net_income: string,
 *           non_cash_adjustments: [
 *             { label: string, amount: string, gl_code: string?, note: string? },
 *           ],
 *           working_capital_changes: [
 *             { label: string, amount: string, gl_code: string?, note: string? },
 *           ],
 *           total: string,                  // net cash from operating
 *         },
 *         investing: {
 *           items: [],                       // empty for current scope
 *           total: '0.00',
 *           note: string,                    // "Not applicable — ..."
 *         },
 *         financing: {
 *           items: [],
 *           total: '0.00',
 *           note: string,
 *         },
 *         net_change_in_cash: string,        // sum of operating+investing+financing
 *         opening_cash: string,              // BANK balance at (from - 1 day)
 *         closing_cash: string,              // BANK balance at (to)
 *         reconciliation_difference: string, // closing - opening - net_change
 *         is_balanced: bool,                 // |reconciliation_difference| <= ₦1.00
 *         generated_at: ISO,
 *     } }
 *
 * ─── Indirect method math (IAS 7) ────────────────────────────────
 *
 *   Net income for the period                     (from IS computation)
 *   + Non-cash expenses
 *       + Loan loss provision (LLP DR posts)      (DR LLP / CR ALLOW —
 *                                                  no cash moved; book entry)
 *       + Bad debt write-offs (BDE DR posts)      (DR BDE / CR LR —
 *                                                  no cash; loan was already
 *                                                  disbursed in a prior period)
 *   - Increase in loans receivable (or + decrease)
 *       (LR balance end - LR balance start)       (Disbursements net of
 *                                                  repayments — cash went
 *                                                  out as principal)
 *   = Net cash from operating activities
 *
 * ─── GL choices ────────────────────────────────────────────────────
 *
 *   Why LR not LR+CUBGL: CUBGL is a customer wash account that nets
 *   to zero in steady state. Disbursement does DR LR + CR CUBGL,
 *   then DR CUBGL for the net cash transferred. CUBGL ends at zero
 *   per customer if the disbursement completes correctly. Including
 *   CUBGL in the receivables computation would double-count.
 *
 *   Why BANK for opening/closing cash: BANK is the canonical cash
 *   GL (acct# 1003). The Settlement Account (SETTLE, 1004) is a
 *   short-lived bridge during disbursement and shouldn't appear
 *   on the SCF as cash.
 *
 *   Why is_closing_entry filter: same reasoning as the IS Phase-1
 *   hotfix. Closing entries cancel the period's actual income/expense
 *   activity within the same date range. Without this filter, a
 *   closed period's SCF would show zero net income and zero non-cash
 *   adjustments.
 *
 * ─── Investing & financing sections ───────────────────────────────
 *
 *   Both sections are reported as zero with explanatory notes per
 *   IAS 7 (a complete statement has all three sections even if
 *   inactive). CreditX as currently designed:
 *
 *     - No PP&E entity → no purchase/sale of fixed assets
 *     - No equity issuance tracked → no proceeds from share issue
 *     - No external debt instruments → no proceeds from borrowings
 *
 *   When/if those become real (Phase 4+), the items[] arrays here
 *   will be populated.
 *
 * ─── Reconciliation check ─────────────────────────────────────────
 *
 *   The SCF's bottom line (net_change_in_cash) should equal the
 *   actual change in the BANK GL balance over the period. We compute
 *   both and surface the difference. A non-zero difference means a
 *   non-cash item was missed — typically a posting path that hits
 *   BANK but isn't classified here. ₦1.00 tolerance for BCMath
 *   rounding noise.
 *
 *   Reconciliation difference = (closing_cash - opening_cash) - net_change_in_cash
 *
 *   Real lenders should investigate non-zero differences; the report
 *   shows the value so it's auditable rather than silently swept.
 *
 * Gated by accounting.view (matches IS, BS, GL Reconciliation).
 */
final class StatementOfCashFlowsAction
{
    use ApiResponse;

    /** Tolerance for the reconciliation balance check, in naira. */
    private const RECONCILIATION_TOLERANCE = '1.00';

    public function __construct(
        private readonly EntityManagerInterface $em,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $params = $request->getQueryParams();
        $from = $this->sanitizeDate($params['from'] ?? null, date('Y-m-01'));
        $to   = $this->sanitizeDate($params['to'] ?? null, date('Y-m-d'));
        if (strcmp($from, $to) > 0) {
            [$from, $to] = [$to, $from];
        }

        // ── Net income (same logic as IS) ─────────────────────────
        $income  = $this->sumByType(AccountType::INCOME,  $from, $to);
        $expense = $this->sumByType(AccountType::EXPENSE, $from, $to);
        $netIncome = bcsub($income, $expense, 2);

        // ── Non-cash adjustments ─────────────────────────────────
        // Add back expenses that hit the IS but didn't move cash.
        // We sum the DR side of each non-cash expense GL within the
        // period (excluding closing entries) — that's the magnitude
        // posted as expense.
        $llp = $this->expenseDrSum('LLP', $from, $to);
        $bde = $this->expenseDrSum('BDE', $from, $to);

        $nonCashAdjustments = [];
        if (bccomp($llp, '0.00', 2) !== 0) {
            $nonCashAdjustments[] = [
                'label'   => 'Loan loss provision (non-cash)',
                'amount'  => $llp,
                'gl_code' => 'LLP',
                'note'    => 'Provisioning hits the IS via DR LLP / CR ALLOW. '
                          . 'No cash moved — added back.',
            ];
        }
        if (bccomp($bde, '0.00', 2) !== 0) {
            $nonCashAdjustments[] = [
                'label'   => 'Bad debt write-off (non-cash)',
                'amount'  => $bde,
                'gl_code' => 'BDE',
                'note'    => 'Write-offs DR BDE / CR LR. The loan principal '
                          . 'was disbursed in a prior period — no cash moved '
                          . 'on write-off. Added back.',
            ];
        }
        $nonCashTotal = '0.00';
        foreach ($nonCashAdjustments as $a) {
            $nonCashTotal = bcadd($nonCashTotal, $a['amount'], 2);
        }

        // ── Working capital changes ──────────────────────────────
        // Increase in loans receivable = cash went out (subtract).
        // Decrease = cash came in (add). The convention: we compute
        // (LR_start - LR_end) which is positive when receivables
        // shrank (cash came in).
        $lrStartBalance = $this->assetBalance('LR', $this->dayBefore($from));
        $lrEndBalance   = $this->assetBalance('LR', $to);
        $lrChange       = bcsub($lrStartBalance, $lrEndBalance, 2); // +ve if shrank
        $lrLabel = bccomp($lrChange, '0.00', 2) >= 0
            ? 'Decrease in loans receivable'
            : 'Increase in loans receivable';

        $workingCapital = [];
        if (bccomp($lrChange, '0.00', 2) !== 0) {
            $workingCapital[] = [
                'label'   => $lrLabel,
                'amount'  => $lrChange,
                'gl_code' => 'LR',
                'note'    => 'Net change in loan portfolio principal. '
                          . 'Disbursements minus repayments. CUBGL '
                          . 'excluded — it is a customer wash account '
                          . 'that nets to zero in steady state.',
            ];
        }
        $wcTotal = '0.00';
        foreach ($workingCapital as $w) {
            $wcTotal = bcadd($wcTotal, $w['amount'], 2);
        }

        $operatingTotal = bcadd(bcadd($netIncome, $nonCashTotal, 2), $wcTotal, 2);

        // ── Investing & financing — zero placeholders per IAS 7 ──
        $investing = [
            'items' => [],
            'total' => '0.00',
            'note'  => 'Not applicable — CreditX does not currently track '
                     . 'PP&E or other investing instruments. Future scope '
                     . '(Phase 4+) may add fixed asset accounting and '
                     . 'populate this section.',
        ];
        $financing = [
            'items' => [],
            'total' => '0.00',
            'note'  => 'Not applicable — CreditX does not currently track '
                     . 'equity issuance or external debt instruments. Future '
                     . 'scope may add capital-account ledgers and populate '
                     . 'this section.',
        ];

        $netChangeInCash = bcadd(bcadd($operatingTotal, $investing['total'], 2), $financing['total'], 2);

        // ── Reconciliation check ─────────────────────────────────
        // Compare the computed net change to the actual change in
        // the BANK GL balance over the period. Any difference means
        // a posting path moved cash without being classified above.
        $openingCash = $this->assetBalance('BANK', $this->dayBefore($from));
        $closingCash = $this->assetBalance('BANK', $to);
        $actualCashChange = bcsub($closingCash, $openingCash, 2);
        $reconciliationDiff = bcsub($actualCashChange, $netChangeInCash, 2);
        $absDiff = ltrim($reconciliationDiff, '-');
        $isBalanced = bccomp($absDiff, self::RECONCILIATION_TOLERANCE, 2) <= 0;

        return $this->success([
            'period' => [
                'from'  => $from,
                'to'    => $to,
                'label' => $this->periodLabel($from, $to),
            ],
            'operating' => [
                'net_income'              => $netIncome,
                'non_cash_adjustments'    => $nonCashAdjustments,
                'working_capital_changes' => $workingCapital,
                'total'                   => $operatingTotal,
            ],
            'investing' => $investing,
            'financing' => $financing,
            'net_change_in_cash'         => $netChangeInCash,
            'opening_cash'               => $openingCash,
            'closing_cash'               => $closingCash,
            'reconciliation_difference'  => $reconciliationDiff,
            'is_balanced'                => $isBalanced,
            'generated_at'               => (new \DateTimeImmutable())->format('c'),
        ]);
    }

    /**
     * Sum income or expense activity within the date range.
     * Same semantics as IncomeStatementAction's per-account totals
     * but flat (we only care about the type-level totals here).
     *
     * Income: balance = CR - DR (CR-normal). Returns positive for income.
     * Expense: balance = DR - CR (DR-normal). Returns positive for expense.
     */
    private function sumByType(AccountType $type, string $from, string $to): string
    {
        $row = $this->em->getConnection()->fetchAssociative(
            "SELECT
                COALESCE(SUM(CASE WHEN t.trans_type = 'DR' THEN t.trans_amount ELSE 0 END), 0) AS total_dr,
                COALESCE(SUM(CASE WHEN t.trans_type = 'CR' THEN t.trans_amount ELSE 0 END), 0) AS total_cr
             FROM general_ledgers gl
             INNER JOIN ledger_transactions t ON t.gl_id = gl.id
             WHERE gl.account_type = :type
               AND t.is_closing_entry = false
               AND t.posting_date >= :fromDate
               AND t.posting_date <= :toDate",
            ['type' => $type->value, 'fromDate' => $from, 'toDate' => $to],
        );

        $dr = (string) ($row['total_dr'] ?? '0');
        $cr = (string) ($row['total_cr'] ?? '0');

        // Income is CR-normal; Expense is DR-normal.
        return $type === AccountType::EXPENSE
            ? bcsub($dr, $cr, 2)
            : bcsub($cr, $dr, 2);
    }

    /**
     * Sum DR-side activity for a specific expense GL within the
     * period (excluding closing entries). Used for non-cash add-backs
     * where we want the gross amount expensed, not the net balance.
     *
     * For LLP and BDE, postings are always DR (debit normal expense
     * accounts get DR-debited when expense is recognized). Reversals
     * would post CR — those are subtracted to get the net non-cash
     * expense for the period.
     */
    private function expenseDrSum(string $glCode, string $from, string $to): string
    {
        $row = $this->em->getConnection()->fetchAssociative(
            "SELECT
                COALESCE(SUM(CASE WHEN t.trans_type = 'DR' THEN t.trans_amount ELSE 0 END), 0) AS total_dr,
                COALESCE(SUM(CASE WHEN t.trans_type = 'CR' THEN t.trans_amount ELSE 0 END), 0) AS total_cr
             FROM general_ledgers gl
             INNER JOIN ledger_transactions t ON t.gl_id = gl.id
             WHERE gl.account_code = :code
               AND t.is_closing_entry = false
               AND t.posting_date >= :fromDate
               AND t.posting_date <= :toDate",
            ['code' => $glCode, 'fromDate' => $from, 'toDate' => $to],
        );

        $dr = (string) ($row['total_dr'] ?? '0');
        $cr = (string) ($row['total_cr'] ?? '0');
        return bcsub($dr, $cr, 2);
    }

    /**
     * Cumulative balance of an asset GL up through (and including)
     * the given date. Asset accounts are DR-normal: balance = DR - CR.
     *
     * Used for opening/closing cash and the receivables snapshot.
     * Does NOT exclude closing entries — closing entries don't post
     * to asset accounts (only income/expense → equity), so the
     * inclusion/exclusion has no effect for asset balance queries.
     */
    private function assetBalance(string $glCode, string $asOf): string
    {
        $row = $this->em->getConnection()->fetchAssociative(
            "SELECT
                COALESCE(SUM(CASE WHEN t.trans_type = 'DR' THEN t.trans_amount ELSE 0 END), 0) AS total_dr,
                COALESCE(SUM(CASE WHEN t.trans_type = 'CR' THEN t.trans_amount ELSE 0 END), 0) AS total_cr
             FROM general_ledgers gl
             INNER JOIN ledger_transactions t ON t.gl_id = gl.id
             WHERE gl.account_code = :code
               AND t.posting_date <= :asOf",
            ['code' => $glCode, 'asOf' => $asOf],
        );

        $dr = (string) ($row['total_dr'] ?? '0');
        $cr = (string) ($row['total_cr'] ?? '0');
        return bcsub($dr, $cr, 2); // asset = DR - CR
    }

    /**
     * Compute the date one day before $date. Used for opening
     * balances — opening cash on YYYY-MM-01 is the cumulative
     * balance through YYYY-(M-1)-last.
     */
    private function dayBefore(string $date): string
    {
        return (new \DateTimeImmutable($date))
            ->modify('-1 day')
            ->format('Y-m-d');
    }

    private function sanitizeDate(?string $input, string $default): string
    {
        if ($input === null || $input === '') return $default;
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $input) === 1) {
            return $input;
        }
        return $default;
    }

    private function periodLabel(string $from, string $to): string
    {
        $f = new \DateTimeImmutable($from);
        $t = new \DateTimeImmutable($to);
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
