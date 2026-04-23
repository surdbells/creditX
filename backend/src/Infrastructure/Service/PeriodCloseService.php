<?php
declare(strict_types=1);
namespace App\Infrastructure\Service;

use App\Domain\Entity\AccountingPeriod;
use App\Domain\Entity\GeneralLedger;
use App\Domain\Entity\LedgerTransaction;
use App\Domain\Enum\AccountType;
use App\Domain\Enum\PeriodStatus;
use App\Domain\Enum\TransactionType;
use App\Domain\Exception\DomainException;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Period-close service — encapsulates the accounting actions of
 * closing and reopening a monthly period.
 *
 * Closing steps (all in one transaction):
 *   1. Validate period is currently OPEN
 *   2. Sum net income for the period: (income accounts CR-balance)
 *      − (expense accounts DR-balance), scoped to trans_date within
 *      [year-month-01, year-month-last_day].
 *   3. For each income account with activity: DR its balance (zeros
 *      the account for the period boundary)
 *      CR Retained Earnings GL for the sum
 *   4. For each expense account with activity: CR its balance (zeros
 *      the account)
 *      DR Retained Earnings GL for the sum
 *   5. Net effect on Retained Earnings: + net income, − net expense.
 *      The 'closing journal' has a callback ref CLOSE-YYYY-MM-<ts>
 *      that groups all postings.
 *   6. Flip period status to CLOSED, record closed_at/closed_by,
 *      store the callback + net_income_posted.
 *
 * Reopening:
 *   Looks up the closing callback, reverses all entries with that
 *   callback via JournalReversalService (which swaps CR/DR for each
 *   entry and creates mirror postings). Flips status to OPEN.
 *   Clears closed_at/closed_by/closing_callback.
 *
 * Retained Earnings GL:
 *   Looked up by account code 'RETEARN' (asset_type = equity). If
 *   not seeded, the close fails with a clear error — operator must
 *   seed the GL before closing.
 */
final class PeriodCloseService
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly JournalReversalService $reversalService,
    ) {}

    /**
     * Close a period. Posts the closing journal inside a transaction
     * and transitions the period to CLOSED.
     *
     * @throws DomainException  on validation failure or missing
     *                          retained-earnings GL
     */
    public function closePeriod(AccountingPeriod $period, string $userId, ?string $notes = null): array
    {
        if (!$period->isOpen()) {
            throw new DomainException('Period is already closed');
        }

        // Locate the Retained Earnings GL. Operator must seed this
        // before closing a period. We don't auto-create because
        // posting account codes + types is a chart-of-accounts
        // decision, not a service-level decision.
        $retEarn = $this->em->getRepository(GeneralLedger::class)
            ->findOneBy(['accountCode' => 'RETEARN']);
        if ($retEarn === null) {
            // Fallback: any EQUITY account whose name contains
            // 'retained' (case-insensitive) — more forgiving, but
            // still requires some chart setup.
            $qb = $this->em->createQueryBuilder()
                ->select('gl')->from(GeneralLedger::class, 'gl')
                ->where('gl.accountType = :t')
                ->andWhere('LOWER(gl.accountName) LIKE :n')
                ->setParameter('t', AccountType::EQUITY->value)
                ->setParameter('n', '%retained%')
                ->setMaxResults(1);
            $retEarn = $qb->getQuery()->getOneOrNullResult();
        }
        if ($retEarn === null) {
            throw new DomainException(
                'Retained Earnings GL not found. Seed a GL with accountCode=RETEARN ' .
                'and accountType=equity before closing a period.'
            );
        }

        $year = $period->getYear();
        $month = $period->getMonth();
        $fromDate = "{$year}-{$month}-01";
        // Last day of the period's month
        $lastDay = (new \DateTimeImmutable("{$year}-{$month}-01"))
            ->modify('last day of this month')
            ->format('Y-m-d');
        $toDate = $lastDay;

        $conn = $this->em->getConnection();

        // Sum income + expense for the period. The same query shape as
        // Income Statement, just scoped to this period.
        $sumSql = "
            SELECT
                gl.id, gl.account_code, gl.account_type,
                COALESCE(SUM(CASE WHEN t.trans_type = 'DR' THEN t.trans_amount ELSE 0 END), 0) AS dr,
                COALESCE(SUM(CASE WHEN t.trans_type = 'CR' THEN t.trans_amount ELSE 0 END), 0) AS cr
            FROM general_ledger gl
            INNER JOIN ledger_transactions t ON t.gl_id = gl.id
            WHERE gl.account_type IN (:incomeT, :expenseT)
              AND CONCAT(t.trans_year, '-', t.trans_month, '-', t.trans_day) >= :fromDate
              AND CONCAT(t.trans_year, '-', t.trans_month, '-', t.trans_day) <= :toDate
            GROUP BY gl.id, gl.account_code, gl.account_type
        ";
        $rows = $conn->executeQuery($sumSql, [
            'incomeT'  => AccountType::INCOME->value,
            'expenseT' => AccountType::EXPENSE->value,
            'fromDate' => $fromDate,
            'toDate'   => $toDate,
        ])->fetchAllAssociative();

        $this->em->beginTransaction();
        try {
            $callback = 'CLOSE-' . $year . '-' . $month . '-' . date('YmdHis');
            $dateParts = [$year, $month, $lastDay]; // use last-day-of-month for the close
            // Wait — $lastDay is already 'YYYY-MM-DD'. Need just day.
            $closeDay = substr($lastDay, 8, 2);

            $totalIncome = '0.00';
            $totalExpense = '0.00';

            foreach ($rows as $r) {
                $isIncome = $r['account_type'] === AccountType::INCOME->value;
                $isExpense = $r['account_type'] === AccountType::EXPENSE->value;
                $dr = (string) $r['dr'];
                $cr = (string) $r['cr'];
                // Income: CR-normal. Balance = CR - DR (positive = earned).
                // Expense: DR-normal. Balance = DR - CR (positive = spent).
                $balance = $isIncome ? bcsub($cr, $dr, 2) : bcsub($dr, $cr, 2);

                if (bccomp($this->abs($balance), '0.00', 2) === 0) continue; // no activity to close

                $gl = $this->em->find(GeneralLedger::class, $r['id']);
                if ($gl === null) continue;

                if ($isIncome) {
                    // Zero out income: DR the income account, CR retained earnings
                    $this->postEntry($gl, TransactionType::DR, $balance,
                        "Close {$period->getLabel()}: zero income account {$r['account_code']}",
                        $callback, $year, $month, $closeDay, $userId);
                    $this->postEntry($retEarn, TransactionType::CR, $balance,
                        "Close {$period->getLabel()}: retained earnings (income from {$r['account_code']})",
                        $callback, $year, $month, $closeDay, $userId);
                    $totalIncome = bcadd($totalIncome, $balance, 2);
                } elseif ($isExpense) {
                    // Zero out expense: CR the expense account, DR retained earnings
                    $this->postEntry($gl, TransactionType::CR, $balance,
                        "Close {$period->getLabel()}: zero expense account {$r['account_code']}",
                        $callback, $year, $month, $closeDay, $userId);
                    $this->postEntry($retEarn, TransactionType::DR, $balance,
                        "Close {$period->getLabel()}: retained earnings (expense from {$r['account_code']})",
                        $callback, $year, $month, $closeDay, $userId);
                    $totalExpense = bcadd($totalExpense, $balance, 2);
                }
            }

            $netIncome = bcsub($totalIncome, $totalExpense, 2);

            $period->setStatus(PeriodStatus::CLOSED);
            $period->setClosedAt(new \DateTimeImmutable());
            $period->setClosedBy($userId);
            $period->setClosingCallback($callback);
            $period->setNetIncomePosted($netIncome);
            if ($notes !== null && $notes !== '') $period->setNotes($notes);

            $this->em->flush();
            $this->em->commit();

            return [
                'period_id'        => $period->getId(),
                'label'            => $period->getLabel(),
                'closing_callback' => $callback,
                'total_income'     => $totalIncome,
                'total_expense'    => $totalExpense,
                'net_income'       => $netIncome,
                'accounts_closed'  => count($rows),
            ];
        } catch (\Throwable $e) {
            if ($this->em->getConnection()->isTransactionActive()) {
                $this->em->rollback();
            }
            throw $e;
        }
    }

    /**
     * Reopen a closed period. Reverses the closing journal and flips
     * status back to OPEN. Attributes the reopening to the current
     * user via the reversal's posted_by.
     */
    public function reopenPeriod(AccountingPeriod $period, string $userId, ?string $reason = null): array
    {
        if (!$period->isClosed()) {
            throw new DomainException('Period is not closed');
        }
        $callback = $period->getClosingCallback();
        if ($callback === null) {
            throw new DomainException('No closing callback recorded for this period — cannot auto-reverse');
        }

        // Reverse every entry under the closing callback
        $conn = $this->em->getConnection();
        $firstEntry = $conn->fetchAssociative(
            'SELECT id FROM ledger_transactions WHERE trans_callback = :cb ORDER BY created_at ASC LIMIT 1',
            ['cb' => $callback],
        );
        if ($firstEntry === false) {
            throw new DomainException('Closing journal not found for callback ' . $callback);
        }

        // JournalReversalService.reverse() reverses ALL entries sharing
        // the same callback as the target — so one call reverses the
        // whole closing journal in one shot.
        $result = $this->reversalService->reverse(
            (string) $firstEntry['id'],
            $userId,
            $reason ?? ('Reopened period ' . $period->getLabel()),
        );

        $period->setStatus(PeriodStatus::OPEN);
        $period->setClosedAt(null);
        $period->setClosedBy(null);
        $period->setClosingCallback(null);
        $period->setNetIncomePosted(null);
        $this->em->flush();

        return [
            'period_id'          => $period->getId(),
            'label'              => $period->getLabel(),
            'reversal_callback'  => $result['reversal_callback'] ?? null,
            'entries_reversed'   => $result['reversed_entries'] ?? 0,
        ];
    }

    /**
     * Check if a given date falls inside a CLOSED period. Used by
     * posting services to block back-dated entries after a close.
     *
     * Cheap — one indexed lookup on (year, month). The call sites can
     * hit this once per transaction (at the top of the service method)
     * rather than per-entry, since every entry in a single transaction
     * shares the same effective date.
     */
    public function isDateInClosedPeriod(string $year, string $month): bool
    {
        $repo = $this->em->getRepository(AccountingPeriod::class);
        $period = $repo->findOneBy(['year' => $year, 'month' => str_pad($month, 2, '0', STR_PAD_LEFT)]);
        return $period !== null && $period->isClosed();
    }

    /**
     * Assert that a date (YYYY-MM-DD) is not in a closed period. Throws
     * DomainException with a clear operator-friendly message if it is.
     *
     * Use at the top of any service method that posts ledger entries
     * with a user-supplied effective date. Back-dated postings into a
     * closed period silently corrupt the closing-journal balance (the
     * closing journal zeroed out income/expense as of the last day of
     * the month — a new posting with that same date reintroduces
     * activity that was never closed).
     *
     * Note: the period-close service itself is exempt by construction —
     * it never calls this method on the period it's closing. The
     * services that do call it are the regular posting paths
     * (Disbursement, Repayment, Lifecycle, Reversal, Overdue).
     */
    public function assertDateOpen(string $date): void
    {
        if (!preg_match('/^(\d{4})-(\d{2})-\d{2}$/', $date, $m)) {
            // If the date is malformed we defer the complaint to the
            // downstream validation — we're not in the business of
            // validating date formats here.
            return;
        }
        if ($this->isDateInClosedPeriod($m[1], $m[2])) {
            throw new DomainException(
                "Cannot post to closed period {$m[1]}-{$m[2]}. " .
                "Reopen the period first (Accounting → Period Close → Reopen) " .
                "if you need to amend it."
            );
        }
    }

    /**
     * Post a single ledger entry. Thin helper mirroring the pattern
     * in DisbursementService — kept inline here since the close is
     * the only caller and we don't want to share private methods.
     */
    private function postEntry(
        GeneralLedger $gl,
        TransactionType $type,
        string $amount,
        string $narration,
        string $callback,
        string $year,
        string $month,
        string $day,
        string $userId,
    ): void {
        $entry = new LedgerTransaction();
        $entry->setGeneralLedger($gl);
        $entry->setTransType($type);
        $entry->setTransAmount($amount);
        $entry->setTransNarration($narration);
        $entry->setTransCallback($callback);
        $entry->setTransDate($year, $month, $day);
        $entry->setPostedBy($userId);
        $this->em->persist($entry);
    }

    private function abs(string $n): string
    {
        return str_starts_with($n, '-') ? substr($n, 1) : $n;
    }
}
