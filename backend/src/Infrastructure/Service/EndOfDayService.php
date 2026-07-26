<?php

declare(strict_types=1);

namespace App\Infrastructure\Service;

use App\Domain\Entity\AccountingCalendar;
use App\Domain\Enum\BusinessDateStatus;
use App\Domain\Exception\DomainException;
use App\Domain\Repository\AccountingCalendarRepository;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;

/**
 * End-of-Day — closes a business date and advances the books to the next one.
 *
 * Sequence (§6):
 *   claim the date (OPEN → PROCESSING, atomically)
 *      ↓ postings are now locked for this date
 *   validate trial balance
 *   generate GL summaries
 *   run daily jobs (overdue detection, investment accrual)
 *   run month-end accruals — only on the last day of a month
 *   generate reports / backup — optional hooks
 *      ↓
 *   close the date, open the next, advance Current Accounting Date (atomic)
 *
 * If any VALIDATION step fails the run aborts and the date is returned to OPEN,
 * exactly as specified — an unbalanced ledger must never be sealed. Non-fatal
 * job failures are recorded against the run but do not block the close, because
 * a failed overdue sweep is an operational problem, not an accounting one, and
 * holding the books open for it would be worse.
 *
 * ## Race safety
 *
 * The OPEN → PROCESSING transition is a conditional UPDATE (WHERE status =
 * 'open') and the affected-row count is checked. Two operators pressing Run EOD
 * at the same moment therefore cannot both proceed: exactly one claims the
 * date, the other is told it is already running. The claim is committed before
 * any step executes, so concurrent postings see PROCESSING and are refused by
 * AccountingDateService.
 *
 * ## What EOD deliberately does NOT do
 *
 * It does not run the monthly loan-interest accrual on an ordinary day. That
 * job is month-end by design (one POSTED run per year+month) and firing it
 * daily would either be refused or double-count. It runs only when the date
 * being closed is the last day of its month.
 */
final class EndOfDayService
{
    /** Steps whose failure aborts the run and keeps the date OPEN. */
    private const FATAL_STEPS = ['validate_trial_balance'];

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly AccountingCalendarRepository $calendarRepo,
        private readonly AccountingDateService $accountingDate,
        private readonly SettingsCacheService $settings,
        private readonly AuditService $audit,
        private readonly ?OverdueService $overdue = null,
        private readonly ?InvestmentService $investments = null,
        private readonly ?InterestAccrualService $interestAccrual = null,
        private readonly ?LoggerInterface $logger = null,
    ) {}

    /**
     * Run End-of-Day for a business date (defaults to the current accounting
     * date).
     *
     * @param bool $dryRun run the validations and report, but change nothing.
     * @return array{date:string, status:string, steps:array<int,array<string,mixed>>, next_date:?string, errors:array<int,string>}
     */
    public function run(?string $date, ?string $userId, bool $dryRun = false, ?string $ip = null, ?string $ua = null): array
    {
        $date ??= $this->accountingDate->currentAccountingDate();
        $this->assertDate($date);

        // Never close a date the books have not reached.
        if ($date > $this->accountingDate->currentAccountingDate()) {
            throw new DomainException('Cannot run End-of-Day for a future accounting date.');
        }

        $row = $this->accountingDate->ensureRow($date, BusinessDateStatus::OPEN);
        $this->em->flush();

        if ($row->isClosed()) {
            throw new DomainException("Business date {$date} is already closed.");
        }

        // Refuse if any date is already mid-run — one EOD at a time, system wide.
        $busy = $this->calendarRepo->findProcessing();
        if ($busy !== null && $busy->getDateString() !== $date) {
            throw new DomainException("End-of-Day is already running for {$busy->getDateString()}.");
        }

        $steps = [];
        $errors = [];

        if ($dryRun) {
            // Validation only. Nothing is claimed, nothing changes.
            $steps[] = $this->stepTrialBalance($date);
            $steps[] = $this->stepGlSummary($date);
            $errors = $this->collectErrors($steps);
            return [
                'date' => $date, 'dry_run' => true,
                'status' => $errors === [] ? 'would_succeed' : 'would_fail',
                'steps' => $steps, 'next_date' => null, 'errors' => $errors,
            ];
        }

        // ─── Claim the date (§6 "lock new postings") ───
        if (!$this->claim($date)) {
            throw new DomainException("End-of-Day is already running for {$date}.");
        }
        // The claim was raw SQL, so the managed entity still shows the old
        // status. Refresh this one row rather than clearing the whole identity
        // map, which would detach everything mid-run.
        $this->em->refresh($row);
        $row->setEodStartedAt(new \DateTimeImmutable());
        $this->em->flush();

        $this->audit->logCreate($userId, 'EndOfDay', $date,
            ['event' => 'eod_started', 'business_date' => $date], $ip ?? '', $ua ?? '');
        $this->logger?->info('EOD started', ['date' => $date, 'user' => $userId]);

        try {
            $steps[] = $this->stepTrialBalance($date);
            $errors = $this->collectErrors($steps, self::FATAL_STEPS);
            if ($errors !== []) {
                return $this->abort($date, $row, $steps, $errors, $userId, $ip, $ua);
            }

            $steps[] = $this->stepGlSummary($date);
            $steps[] = $this->stepOverdue($date);
            $steps[] = $this->stepInvestmentAccrual($date);
            $steps[] = $this->stepMonthEndAccrual($date, $userId);
            $steps[] = $this->stepReports($date);
            $steps[] = $this->stepBackup($date);

            // Any fatal step that slipped through aborts before we seal the day.
            $errors = $this->collectErrors($steps, self::FATAL_STEPS);
            if ($errors !== []) {
                return $this->abort($date, $row, $steps, $errors, $userId, $ip, $ua);
            }

            // ─── Close, open next, advance — atomically ───
            $next = (new \DateTimeImmutable($date))->modify('+1 day')->format('Y-m-d');

            $this->em->beginTransaction();
            try {
                $row->close($userId);
                $row->setEodCompletedAt(new \DateTimeImmutable());
                $row->setEodResult(['steps' => $steps]);

                $nextRow = $this->accountingDate->ensureRow($next, BusinessDateStatus::OPEN);
                $nextRow->open($userId);

                $this->accountingDate->setCurrentAccountingDate($next);

                $this->em->flush();
                $this->em->commit();
            } catch (\Throwable $e) {
                $this->em->rollback();
                throw $e;
            }

            $this->audit->logCreate($userId, 'EndOfDay', $date,
                ['event' => 'eod_completed', 'business_date' => $date, 'next_date' => $next], $ip ?? '', $ua ?? '');
            $this->logger?->info('EOD completed', ['date' => $date, 'next' => $next]);

            return [
                'date' => $date, 'dry_run' => false, 'status' => 'completed',
                'steps' => $steps, 'next_date' => $next,
                'errors' => $this->collectErrors($steps),   // non-fatal warnings, if any
            ];
        } catch (DomainException $e) {
            throw $e;
        } catch (\Throwable $e) {
            // Unexpected failure — never leave the date stuck in PROCESSING.
            $steps[] = ['step' => 'unexpected_error', 'status' => 'failed', 'detail' => $e->getMessage()];
            return $this->abort($date, $row, $steps, [$e->getMessage()], $userId, $ip, $ua);
        }
    }

    /**
     * Reopen a CLOSED business date (§7). The Current Accounting Date is NOT
     * moved back — reopening restores the ability to post to that date through
     * the normal backdating rules, which is what an amendment needs, without
     * rewinding the books for everyone.
     */
    public function reopen(string $date, string $reason, ?string $userId, ?string $ip = null, ?string $ua = null): AccountingCalendar
    {
        $this->assertDate($date);

        if (!$this->settings->getBool(AccountingDateService::S_ALLOW_REOPEN, true)) {
            throw new DomainException('Reopening a closed accounting period is disabled.');
        }
        $reason = trim($reason);
        if ($reason === '') {
            throw new DomainException('A reason is required to reopen a closed accounting period.');
        }

        $row = $this->calendarRepo->findByDate($date);
        if ($row === null) {
            throw new DomainException("No accounting calendar entry for {$date}.");
        }
        if (!$row->isClosed()) {
            throw new DomainException("Business date {$date} is {$row->getStatus()->label()}, not closed.");
        }

        $previous = $row->getStatus()->value;
        $row->open($userId);
        $row->incrementReopenCount();
        $row->setNotes(trim(($row->getNotes() ? $row->getNotes() . "\n" : '')
            . sprintf('[%s] Reopened by %s: %s', date('Y-m-d H:i:s'), $userId ?? 'system', $reason)));
        $this->em->flush();

        // Everything §7 asks to log: user, when, reason, previous and new status.
        $this->audit->logUpdate(
            $userId, 'AccountingCalendar', $row->getId(),
            ['status' => $previous],
            ['status' => $row->getStatus()->value, 'reason' => $reason, 'reopen_count' => $row->getReopenCount()],
            $ip ?? '', $ua ?? '',
        );
        $this->logger?->warning('Accounting period reopened', [
            'date' => $date, 'user' => $userId, 'reason' => $reason, 'from' => $previous,
        ]);

        return $row;
    }

    // ── Steps ───────────────────────────────────────────────────────────────

    /**
     * Debits must equal credits across everything posted up to and including
     * the date. This is the one check that can stop a close: sealing an
     * unbalanced ledger would make the imbalance permanent.
     */
    private function stepTrialBalance(string $date): array
    {
        try {
            $row = $this->em->getConnection()->fetchAssociative(
                "SELECT
                    COALESCE(SUM(CASE WHEN trans_type = 'DR' THEN CAST(trans_amount AS NUMERIC) ELSE 0 END), 0) AS dr,
                    COALESCE(SUM(CASE WHEN trans_type = 'CR' THEN CAST(trans_amount AS NUMERIC) ELSE 0 END), 0) AS cr,
                    COUNT(*) AS rows
                 FROM ledger_transactions
                 WHERE posting_date <= :d",
                ['d' => $date],
            ) ?: ['dr' => 0, 'cr' => 0, 'rows' => 0];

            $dr = number_format((float) $row['dr'], 2, '.', '');
            $cr = number_format((float) $row['cr'], 2, '.', '');
            $diff = bcsub($dr, $cr, 2);
            $abs = ltrim($diff, '-');

            if (bccomp($abs, '0.01', 2) > 0) {
                return $this->step('validate_trial_balance', 'failed', sprintf(
                    'Trial balance does not balance as at %s: debits %s, credits %s, difference %s.',
                    $date, $dr, $cr, $diff,
                ), ['debits' => $dr, 'credits' => $cr, 'difference' => $diff]);
            }

            return $this->step('validate_trial_balance', 'ok',
                sprintf('Balanced: debits %s = credits %s across %d entries.', $dr, $cr, (int) $row['rows']),
                ['debits' => $dr, 'credits' => $cr, 'entries' => (int) $row['rows']]);
        } catch (\Throwable $e) {
            return $this->step('validate_trial_balance', 'failed', 'Trial balance check failed: ' . $e->getMessage());
        }
    }

    /** Per-GL movement for the day, snapshotted onto the run for later reference. */
    private function stepGlSummary(string $date): array
    {
        try {
            $rows = $this->em->getConnection()->fetchAllAssociative(
                "SELECT g.account_code, g.account_name,
                        COALESCE(SUM(CASE WHEN t.trans_type = 'DR' THEN CAST(t.trans_amount AS NUMERIC) ELSE 0 END), 0) AS dr,
                        COALESCE(SUM(CASE WHEN t.trans_type = 'CR' THEN CAST(t.trans_amount AS NUMERIC) ELSE 0 END), 0) AS cr,
                        COUNT(*) AS entries
                 FROM ledger_transactions t
                 JOIN general_ledgers g ON g.id = t.gl_id
                 WHERE t.posting_date = :d
                 GROUP BY g.account_code, g.account_name
                 ORDER BY g.account_code",
                ['d' => $date],
            );
            $summary = array_map(static fn(array $r) => [
                'account_code' => $r['account_code'],
                'account_name' => $r['account_name'],
                'debits'       => number_format((float) $r['dr'], 2, '.', ''),
                'credits'      => number_format((float) $r['cr'], 2, '.', ''),
                'entries'      => (int) $r['entries'],
            ], $rows);

            return $this->step('generate_gl_summaries', 'ok',
                sprintf('%d account(s) moved on %s.', count($summary), $date),
                ['accounts' => $summary]);
        } catch (\Throwable $e) {
            return $this->step('generate_gl_summaries', 'failed', $e->getMessage());
        }
    }

    /** Daily overdue detection + penalties. Non-fatal: operational, not accounting. */
    private function stepOverdue(string $date): array
    {
        if ($this->overdue === null) {
            return $this->step('run_overdue_check', 'skipped', 'Overdue service unavailable.');
        }
        try {
            $r = $this->overdue->processOverdue();
            return $this->step('run_overdue_check', 'ok', sprintf(
                '%d overdue loan(s), %d penalty(ies) applied.',
                $r['overdue_loans'] ?? 0, $r['penalties_applied'] ?? 0,
            ), $r);
        } catch (\Throwable $e) {
            return $this->step('run_overdue_check', 'failed', $e->getMessage());
        }
    }

    /** Investment interest boundaries reached on or before the date. Idempotent. */
    private function stepInvestmentAccrual(string $date): array
    {
        if ($this->investments === null) {
            return $this->step('run_investment_accrual', 'skipped', 'Investment service unavailable.');
        }
        try {
            $gl = $this->settings->get('accounting.eod_settlement_gl_id');
            if (!$gl) {
                return $this->step('run_investment_accrual', 'skipped',
                    'No EOD settlement account configured (accounting.eod_settlement_gl_id).');
            }
            $r = $this->investments->accrueAll($date, (string) $gl, null, false);
            return $this->step('run_investment_accrual', 'ok', sprintf(
                '%d investment(s), gross %s, WHT %s.', $r['investments'], $r['gross'], $r['wht'],
            ), ['investments' => $r['investments'], 'gross' => $r['gross'], 'wht' => $r['wht']]);
        } catch (\Throwable $e) {
            return $this->step('run_investment_accrual', 'failed', $e->getMessage());
        }
    }

    /**
     * Monthly loan-interest accrual, run ONLY when closing the last day of a
     * month. Firing it on an ordinary day would either be refused (one POSTED
     * run per period) or double-count.
     */
    private function stepMonthEndAccrual(string $date, ?string $userId): array
    {
        $d = new \DateTimeImmutable($date);
        if ($d->format('Y-m-d') !== $d->format('Y-m-t')) {
            return $this->step('run_month_end_accrual', 'skipped', 'Not the last day of the month.');
        }
        if ($this->interestAccrual === null) {
            return $this->step('run_month_end_accrual', 'skipped', 'Interest accrual service unavailable.');
        }
        if (!$this->settings->getBool('accounting.eod_run_month_end_accrual', false)) {
            return $this->step('run_month_end_accrual', 'skipped',
                'Disabled (accounting.eod_run_month_end_accrual).');
        }
        try {
            $run = $this->interestAccrual->run($d->format('Y'), $d->format('m'), $userId, 'End-of-Day month-end accrual');
            return $this->step('run_month_end_accrual', 'ok', sprintf(
                'Accrued %s income, %s suspended.', $run->getTotalIncomeAccrued(), $run->getTotalSuspended(),
            ));
        } catch (\Throwable $e) {
            return $this->step('run_month_end_accrual', 'failed', $e->getMessage());
        }
    }

    /** Hook for scheduled report generation. Reports are produced on demand today. */
    private function stepReports(string $date): array
    {
        return $this->step('generate_reports', 'skipped',
            'No scheduled EOD reports configured; reports are generated on demand.');
    }

    /** Optional per §6 — deliberately not automated from the application layer. */
    private function stepBackup(string $date): array
    {
        return $this->step('backup', 'skipped',
            'Backup is handled outside the application (server-level, aaPanel).');
    }

    // ── Internals ───────────────────────────────────────────────────────────

    /**
     * Atomically move OPEN → PROCESSING. Conditional on the current status, so
     * two simultaneous runs cannot both win; the loser sees zero rows affected.
     */
    private function claim(string $date): bool
    {
        $affected = $this->em->getConnection()->executeStatement(
            'UPDATE accounting_calendar SET status = :processing, updated_at = NOW()
             WHERE business_date = :d AND status = :open',
            ['processing' => BusinessDateStatus::PROCESSING->value, 'd' => $date, 'open' => BusinessDateStatus::OPEN->value],
        );
        return $affected > 0;
    }

    /** Return the date to OPEN and record why the run stopped. */
    private function abort(string $date, AccountingCalendar $row, array $steps, array $errors, ?string $userId, ?string $ip, ?string $ua): array
    {
        $this->em->getConnection()->executeStatement(
            'UPDATE accounting_calendar SET status = :open, eod_started_at = NULL, updated_at = NOW() WHERE business_date = :d',
            ['open' => BusinessDateStatus::OPEN->value, 'd' => $date],
        );

        // Re-sync the managed row with what the raw UPDATE just wrote, then
        // record why the run stopped so the failure is inspectable afterwards.
        try {
            $this->em->refresh($row);
            $row->setEodResult(['steps' => $steps, 'errors' => $errors, 'aborted_at' => date('Y-m-d H:i:s')]);
            $this->em->flush();
        } catch (\Throwable $e) {
            // The date is already back to OPEN, which is what matters most;
            // losing the diagnostic blob must not mask the original failure.
            $this->logger?->error('Could not persist EOD failure detail', ['date' => $date, 'error' => $e->getMessage()]);
        }

        $this->audit->logCreate($userId, 'EndOfDay', $date,
            ['event' => 'eod_failed', 'business_date' => $date, 'errors' => $errors], $ip ?? '', $ua ?? '');
        $this->logger?->error('EOD aborted', ['date' => $date, 'errors' => $errors]);

        return [
            'date' => $date, 'dry_run' => false, 'status' => 'failed',
            'steps' => $steps, 'next_date' => null, 'errors' => $errors,
        ];
    }

    /** @param string[] $only limit to these step names; empty = all steps. */
    private function collectErrors(array $steps, array $only = []): array
    {
        $out = [];
        foreach ($steps as $s) {
            if (($s['status'] ?? '') !== 'failed') continue;
            if ($only !== [] && !in_array($s['step'], $only, true)) continue;
            $out[] = $s['detail'];
        }
        return $out;
    }

    private function step(string $name, string $status, string $detail, array $data = []): array
    {
        return ['step' => $name, 'status' => $status, 'detail' => $detail, 'data' => $data];
    }

    private function assertDate(string $d): void
    {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) {
            throw new DomainException('Business date must be a valid date (YYYY-MM-DD).');
        }
    }
}
