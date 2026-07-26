<?php
declare(strict_types=1);
namespace App\Infrastructure\Service;

use App\Domain\Entity\GeneralLedger;
use App\Domain\Entity\InterestAccrualLine;
use App\Domain\Entity\InterestAccrualRun;
use App\Domain\Entity\LedgerTransaction;
use App\Domain\Entity\Loan;
use App\Domain\Enum\JournalEntryType;
use App\Domain\Enum\ProvisionStatus;
use App\Domain\Enum\TransactionType;
use App\Domain\Exception\DomainException;
use Doctrine\ORM\EntityManagerInterface;

/**
 * InterestAccrualService — recognises loan interest income on an accrual
 * basis, one month at a time.
 *
 * ## The accounting
 *
 * For each loan, the interest of the installments due within the accrual
 * month is recognised:
 *
 *   Performing loan (< 90 DPD):
 *     DR Interest Receivable (INTRECV)   CR Interest Income (II)
 *
 *   Non-performing loan (>= 90 DPD) — interest is suspended (PROSPECTIVE):
 *     DR Interest Receivable (INTRECV)   CR Interest in Suspense (INTSUSP)
 *
 * The receivable carries the loan's customer-ledger tag so RepaymentService
 * clears exactly this loan's accrued interest as cash arrives (and releases
 * INTSUSP to income for collected suspended interest).
 *
 * ## Idempotency
 *
 * One POSTED run per (year, month). Re-running a period that already has a
 * POSTED run is refused — reverse the run first, then re-accrue. This
 * mirrors period-close semantics: accrual is a month-end step.
 *
 * ## GL codes (must be seeded — see bin/init-interest-accrual-gls.php)
 *   INTRECV  Interest Receivable (asset)
 *   II       Interest Income (income)
 *   INTSUSP  Interest in Suspense (contra-asset)
 */
final class InterestAccrualService
{
    private const NPL_DPD_THRESHOLD = 90;

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly PeriodGuardService $periodGuard,
        private readonly LedgerService $ledgerService,
        private readonly \App\Domain\Repository\LedgerTransactionRepository $ledgerTxnRepo,
        private readonly GlMappingService $glMapping,
    ) {}

    /**
     * Compute what an accrual run would post for a period, without
     * persisting. Pure read — safe to call repeatedly.
     *
     * @return array{period: string, posting_date: string, lines: array<int, array>,
     *   summary: array{loan_count:int, total_income:string, total_suspended:string, total:string}}
     */
    public function preview(string $year, string $month): array
    {
        [$year, $month] = $this->normalisePeriod($year, $month);
        $this->resolveGl('INTRECV', 'Interest Receivable');
        $this->resolveGl('II', 'Interest Income');
        $this->resolveGl('INTSUSP', 'Interest in Suspense');

        $postingDate = $this->lastDayOfPeriod($year, $month);
        $lines = $this->computeLines($year, $month, $postingDate);

        $income = '0.00';
        $suspended = '0.00';
        $reclassified = '0.00';
        foreach ($lines as $l) {
            if ($l['suspended']) {
                $suspended = bcadd($suspended, $l['interest_accrued'], 2);
            } else {
                $income = bcadd($income, $l['interest_accrued'], 2);
            }
            $reclassified = bcadd($reclassified, $l['reclass_amount'] ?? '0.00', 2);
        }

        return [
            'period'       => "{$year}-{$month}",
            'posting_date' => $postingDate,
            'lines'        => $lines,
            'summary'      => [
                'loan_count'         => count($lines),
                'total_income'       => $income,
                'total_suspended'    => $suspended,
                'total_reclassified' => $reclassified,
                'total'              => bcadd($income, $suspended, 2),
            ],
        ];
    }

    /**
     * Post an accrual run for a period. Computes lines, persists the run +
     * lines, posts the journal, returns the run.
     *
     * @throws DomainException
     */
    public function run(string $year, string $month, ?string $userId = null, ?string $notes = null): InterestAccrualRun
    {
        [$year, $month] = $this->normalisePeriod($year, $month);

        $intRecv = $this->resolveGl('INTRECV', 'Interest Receivable');
        $income  = $this->resolveGl('II', 'Interest Income');
        $intSusp = $this->resolveGl('INTSUSP', 'Interest in Suspense');

        $postingDate = $this->lastDayOfPeriod($year, $month);

        // One POSTED run per period — reverse to re-accrue.
        $existing = $this->em->getRepository(InterestAccrualRun::class)
            ->findOneBy(['periodYear' => $year, 'periodMonth' => $month, 'status' => ProvisionStatus::POSTED]);
        if ($existing !== null) {
            throw new DomainException("Interest already accrued for {$year}-{$month} (run {$existing->getId()}). Reverse it first to re-accrue.");
        }

        // Posting date must be in an open period.
        $this->periodGuard->assertDateOpen($postingDate);

        $lines = $this->computeLines($year, $month, $postingDate);

        $this->em->beginTransaction();
        try {
            $run = new InterestAccrualRun();
            $run->setPeriodYear($year);
            $run->setPeriodMonth($month);
            $run->setPostingDate(new \DateTimeImmutable($postingDate));
            $run->setStatus(ProvisionStatus::POSTED);
            $run->setCreatedBy($userId);
            $run->setNotes($notes);

            $totalIncome = '0.00';
            $totalSuspended = '0.00';
            $totalReclassified = '0.00';
            $journalLines = [];

            foreach ($lines as $l) {
                $reclass = $l['reclass_amount'] ?? '0.00';
                $line = new InterestAccrualLine();
                $line->setLoan($this->em->getReference(Loan::class, $l['loan_id']));
                $line->setApplicationIdSnapshot($l['application_id']);
                $line->setInterestAccrued($l['interest_accrued']);
                $line->setSuspended($l['suspended']);
                $line->setClassification($l['classification']);
                $line->setDaysOverdueSnapshot($l['days_overdue']);
                $line->setCustomerLedgerId($l['customer_ledger_id']);
                $line->setReclassifiedToSuspense($reclass);
                $run->addLine($line);
                $this->em->persist($line);

                $totalReclassified = bcadd($totalReclassified, $reclass, 2);

                // DR Interest Receivable, tagged to the loan's customer
                // ledger so repayments can clear it precisely.
                $drLine = [
                    'gl' => $intRecv,
                    'type' => TransactionType::DR,
                    'amount' => $l['interest_accrued'],
                    'narration' => 'Interest accrued - ' . $l['application_id'],
                ];
                if ($l['customer_ledger_id'] !== null) {
                    $drLine['customerLedger'] = $this->em->getReference(
                        \App\Domain\Entity\CustomerLedger::class,
                        $l['customer_ledger_id']
                    );
                }
                $journalLines[] = $drLine;

                if ($l['suspended']) {
                    $totalSuspended = bcadd($totalSuspended, $l['interest_accrued'], 2);
                } else {
                    $totalIncome = bcadd($totalIncome, $l['interest_accrued'], 2);
                }
            }

            $run->setTotalIncomeAccrued($totalIncome);
            $run->setTotalSuspended($totalSuspended);
            $run->setTotalReclassified($totalReclassified);
            $run->setLoanCount(count($lines));

            // Aggregate credit side: income to II, suspended to INTSUSP.
            if (bccomp($totalIncome, '0.00', 2) > 0) {
                $journalLines[] = ['gl' => $income, 'type' => TransactionType::CR,
                    'amount' => $totalIncome, 'narration' => "Loan interest income accrued — {$year}-{$month}"];
            }
            if (bccomp($totalSuspended, '0.00', 2) > 0) {
                $journalLines[] = ['gl' => $intSusp, 'type' => TransactionType::CR,
                    'amount' => $totalSuspended, 'narration' => "Interest suspended on NPLs — {$year}-{$month}"];
            }
            // NPL reclassification: move previously-recognised uncollected
            // interest out of income into suspense (self-balancing pair).
            if (bccomp($totalReclassified, '0.00', 2) > 0) {
                $journalLines[] = ['gl' => $income, 'type' => TransactionType::DR,
                    'amount' => $totalReclassified, 'narration' => "Interest income reclassified to suspense (NPL) — {$year}-{$month}"];
                $journalLines[] = ['gl' => $intSusp, 'type' => TransactionType::CR,
                    'amount' => $totalReclassified, 'narration' => "Suspense raised on NPL slip — {$year}-{$month}"];
            }

            $journalTotal = bcadd(bcadd($totalIncome, $totalSuspended, 2), $totalReclassified, 2);
            if (!empty($journalLines) && bccomp($journalTotal, '0.00', 2) > 0) {
                $callback = 'ACCR-' . $year . $month . '-' . bin2hex(random_bytes(4));
                $run->setCallbackRef($callback);
                $this->ledgerService->postJournal(
                    entryType: JournalEntryType::INTEREST_ACCRUAL,
                    postingDate: $postingDate,
                    narration: "Loan interest accrual — {$year}-{$month}",
                    postedBy: $userId,
                    lines: $journalLines,
                    legacyCallback: $callback,
                );
            }

            $this->em->persist($run);
            $this->em->flush();
            $this->em->commit();
            return $run;
        } catch (\Throwable $e) {
            if ($this->em->getConnection()->isTransactionActive()) {
                $this->em->rollback();
            }
            throw $e;
        }
    }

    /**
     * Reverse a posted accrual run (mirror DR/CR under a REV- callback),
     * flip status to REVERSED.
     *
     * @throws DomainException
     */
    public function reverseRun(string $runId, ?string $userId = null, ?string $reason = null): InterestAccrualRun
    {
        /** @var InterestAccrualRun|null $run */
        $run = $this->em->find(InterestAccrualRun::class, $runId);
        if ($run === null) {
            throw new DomainException('Interest accrual run not found');
        }
        if ($run->isReversed()) {
            throw new DomainException('Run is already reversed');
        }
        if (!$run->isPosted()) {
            throw new DomainException('Only posted runs can be reversed');
        }

        $this->periodGuard->assertDateOpen(date('Y-m-d'));

        $this->em->beginTransaction();
        try {
            $callback = $run->getCallbackRef();
            if ($callback !== null) {
                $originals = $this->em->getRepository(LedgerTransaction::class)
                    ->findBy(['transCallback' => $callback]);
                if (!empty($originals)) {
                    $originalHeader = $originals[0]->getJournalEntry();
                    if ($originalHeader === null) {
                        throw new DomainException("Accrual run callback '{$callback}' has lines without a JournalEntry header.");
                    }
                    $reversalLines = [];
                    foreach ($originals as $orig) {
                        $reversalLines[] = [
                            'gl' => $orig->getGeneralLedger(),
                            'customerLedger' => $orig->getCustomerLedger(),
                            'type' => $orig->getTransType() === TransactionType::DR
                                ? TransactionType::CR : TransactionType::DR,
                            'amount' => $orig->getTransAmount(),
                            'narration' => 'REVERSAL: ' . ($reason ? "{$reason} — " : '') . $orig->getTransNarration(),
                            'reversalOfLineId' => $orig->getId(),
                        ];
                    }
                    $reversalCb = 'REV-' . $callback . '-' . date('YmdHis');
                    $this->ledgerService->postJournal(
                        entryType: JournalEntryType::REVERSAL,
                        postingDate: date('Y-m-d'),
                        narration: 'Reversal of interest accrual ' . $callback . ($reason ? " — {$reason}" : ''),
                        postedBy: $userId,
                        lines: $reversalLines,
                        legacyCallback: $reversalCb,
                        isReversal: true,
                        reversalOfId: $originalHeader->getId(),
                    );
                }
            }

            $run->setStatus(ProvisionStatus::REVERSED);
            $run->setReversedAt(new \DateTimeImmutable());
            $run->setReversedBy($userId);
            $run->setReversalReason($reason);

            $this->em->flush();
            $this->em->commit();
            return $run;
        } catch (\Throwable $e) {
            if ($this->em->getConnection()->isTransactionActive()) {
                $this->em->rollback();
            }
            throw $e;
        }
    }

    // ─── internal helpers ──────────────────────────────────────────

    /**
     * Per-loan interest to accrue for the period: the scheduled interest of
     * installments due within [periodStart, postingDate], plus the loan's
     * DPD (to decide performing vs suspended) and its customer ledger id.
     *
     * @return array<int, array>
     */
    private function computeLines(string $year, string $month, string $postingDate): array
    {
        $conn = $this->em->getConnection();
        $fromDate = "{$year}-{$month}-01";

        // Interest scheduled in the period per loan (regardless of payment —
        // interest is earned over time, not on collection).
        $sql = "
            SELECT
                l.id AS loan_id,
                l.application_id,
                cl.id AS customer_ledger_id,
                COALESCE(SUM(CAST(rs.interest_amount AS NUMERIC)), 0) AS interest_due
            FROM loans l
            INNER JOIN repayment_schedules rs ON rs.loan_id = l.id
            LEFT JOIN customer_ledgers cl ON cl.loan_id = l.id
            WHERE l.status IN ('active', 'overdue', 'disbursed', 'restructured')
              AND rs.due_date >= :fromDate::date
              AND rs.due_date <= :toDate::date
            GROUP BY l.id, l.application_id, cl.id
            HAVING COALESCE(SUM(CAST(rs.interest_amount AS NUMERIC)), 0) > 0
            ORDER BY l.application_id
        ";
        $rows = $conn->executeQuery($sql, ['fromDate' => $fromDate, 'toDate' => $postingDate])->fetchAllAssociative();
        if (empty($rows)) return [];

        // DPD per loan as of the posting date (max days late among unpaid
        // installments). One query for the batch.
        $loanIds = array_column($rows, 'loan_id');
        $dpd = $this->daysPastDue($loanIds, $postingDate);

        // GLs needed for the NPL reclassification calc below.
        $intRecvId = $this->resolveGl('INTRECV', 'Interest Receivable')->getId();
        $intSuspId = $this->resolveGl('INTSUSP', 'Interest in Suspense')->getId();

        $out = [];
        foreach ($rows as $r) {
            $loanDpd = $dpd[$r['loan_id']] ?? 0;
            $suspended = $loanDpd >= self::NPL_DPD_THRESHOLD;
            $clId = $r['customer_ledger_id'] ?: null;

            // NPL reclassification: when a loan is non-performing, any
            // interest previously RECOGNISED to income but not yet collected
            // should be moved into suspense. Per loan that is:
            //   reclass = (INTRECV balance − INTSUSP balance)
            // i.e. the receivable that isn't already suspended. The formula
            // self-limits — once reclassified it's ~0, so re-running on a
            // still-NPL loan is a no-op, and it re-captures fresh recognised
            // interest if a loan recovers then slips again. Computed on PRIOR
            // balances (this period's accrual isn't posted yet).
            $reclass = '0.00';
            if ($suspended && $clId !== null) {
                $recv = $this->ledgerTxnRepo->getGlSumForCustomerLedger($intRecvId, $clId);
                $susp = $this->ledgerTxnRepo->getGlSumForCustomerLedger($intSuspId, $clId);
                $recvBal = bcsub($recv['total_dr'], $recv['total_cr'], 2); // asset DR−CR
                $suspBal = bcsub($susp['total_cr'], $susp['total_dr'], 2); // contra CR−DR
                $reclass = bcsub($recvBal, $suspBal, 2);
                if (bccomp($reclass, '0.00', 2) < 0) $reclass = '0.00';
            }

            $out[] = [
                'loan_id'            => $r['loan_id'],
                'application_id'     => $r['application_id'],
                'customer_ledger_id' => $clId,
                'interest_accrued'  => number_format((float) $r['interest_due'], 2, '.', ''),
                'days_overdue'      => $loanDpd,
                'suspended'         => $suspended,
                'classification'    => $this->classify($loanDpd),
                'reclass_amount'    => $reclass,
            ];
        }
        return $out;
    }

    /**
     * Max days-past-due per loan as of a date (unpaid installments).
     *
     * @param string[] $loanIds
     * @return array<string, int>
     */
    private function daysPastDue(array $loanIds, string $asOf): array
    {
        if (empty($loanIds)) return [];
        $conn = $this->em->getConnection();
        $placeholders = implode(',', array_fill(0, count($loanIds), '?'));
        $sql = "
            SELECT rs.loan_id, COALESCE(MAX(?::date - rs.due_date), 0) AS dpd
            FROM repayment_schedules rs
            WHERE rs.loan_id IN ($placeholders)
              AND rs.status IN ('pending', 'partial', 'overdue')
            GROUP BY rs.loan_id
        ";
        $params = array_merge([$asOf], $loanIds);
        $rows = $conn->executeQuery($sql, $params)->fetchAllAssociative();
        $out = [];
        foreach ($rows as $r) {
            $out[$r['loan_id']] = max(0, (int) $r['dpd']);
        }
        return $out;
    }

    private function classify(int $dpd): string
    {
        if ($dpd >= 365) return 'lost';
        if ($dpd >= 180) return 'doubtful';
        if ($dpd >= self::NPL_DPD_THRESHOLD) return 'substandard';
        return 'performing';
    }

    private function resolveGl(string $code, string $friendlyName): GeneralLedger
    {
        // Honour a Default Ledgers override for this role, else the seeded code.
        $gl = $this->glMapping->resolveByCode($code);
        if ($gl !== null) return $gl;
        throw new DomainException(
            "{$friendlyName} GL not found. Seed a GL with accountCode='{$code}' "
          . "(run bin/init-interest-accrual-gls.php) before accruing interest."
        );
    }

    /** @return array{0:string,1:string} [year(4), month(2)] */
    private function normalisePeriod(string $year, string $month): array
    {
        $y = preg_replace('/\D/', '', $year);
        $m = str_pad(preg_replace('/\D/', '', $month), 2, '0', STR_PAD_LEFT);
        if (!preg_match('/^\d{4}$/', $y) || !preg_match('/^(0[1-9]|1[0-2])$/', $m)) {
            throw new DomainException('Invalid period — expected year YYYY and month 01-12');
        }
        return [$y, $m];
    }

    private function lastDayOfPeriod(string $year, string $month): string
    {
        return (new \DateTimeImmutable("{$year}-{$month}-01"))
            ->modify('last day of this month')->format('Y-m-d');
    }
}
