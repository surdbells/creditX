<?php
declare(strict_types=1);
namespace App\Infrastructure\Service;

use App\Domain\Entity\GeneralLedger;
use App\Domain\Entity\LedgerTransaction;
use App\Domain\Entity\Loan;
use App\Domain\Entity\ProvisionRun;
use App\Domain\Entity\ProvisionRunLine;
use App\Domain\Enum\AccountType;
use App\Domain\Enum\ProvisionStatus;
use App\Domain\Enum\TransactionType;
use App\Domain\Exception\DomainException;
use Doctrine\ORM\EntityManagerInterface;

/**
 * ProvisionService — orchestrates CBN-style loan loss provisioning.
 *
 * ## The accounting
 *
 * For each non-performing loan, CBN prudential guidelines classify
 * by days-past-due and assign a provision rate:
 *
 *   Substandard  90–179 DPD  →  10 %
 *   Doubtful    180–364 DPD  →  50 %
 *   Lost           365+ DPD  → 100 %
 *
 * Required provision per loan = outstanding × rate.
 *
 * Provisions are CUMULATIVE — month 2's target for the same loan
 * might be higher or lower than month 1's. We only post the DELTA
 * (month2 − month1), not the full amount. Posting the full amount
 * each month would double-count.
 *
 * ## The journal
 *
 * Sum of positive deltas (new provision):
 *   DR  Loan Loss Provision (LLP) — expense, DR-normal
 *   CR  Allowance for Loan Losses (ALLOW) — contra-asset, CR-normal
 *
 * Sum of negative deltas (provision release — happens when
 * collections improve or loans recover):
 *   DR  Allowance for Loan Losses (ALLOW)
 *   CR  Loan Loss Provision (LLP)   [treated as negative expense]
 *
 * If total positive > total negative, the net posts as the above
 * 'new provision' entry. If negative dominates, it posts as a
 * release. Zero net = no entries, but the run is still recorded
 * with lines for audit.
 *
 * ## Prior lookup
 *
 * For each loan, we look up the most recent non-reversed
 * ProvisionRunLine whose run's as_of <= current run's as_of. Its
 * provision_amount_required is the 'prior' amount. If no such line
 * exists (loan's first time in the schedule), prior = 0.
 *
 * ## GL codes
 *
 *   LLP    — Loan Loss Provision (expense)
 *   ALLOW  — Allowance for Loan Losses (asset, contra)
 *
 * Both must be seeded in Chart of Accounts before running. Service
 * fails with a clear error if either is missing.
 */
final class ProvisionService
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly PeriodGuardService $periodGuard,
    ) {}

    /**
     * Compute what a provision run would post, without persisting.
     * Pure calculation — safe to call repeatedly.
     *
     * @return array{
     *   as_of: string,
     *   lines: array<int, array>,
     *   summary: array{
     *     loan_count: int,
     *     total_required: string,
     *     total_prior: string,
     *     total_delta: string,
     *     positive_delta: string,
     *     negative_delta: string,
     *   },
     *   llp_gl_id: string,
     *   allow_gl_id: string,
     * }
     */
    public function preview(string $asOf): array
    {
        $this->assertValidDate($asOf);

        // Resolve GLs up front so a missing one fails the preview
        // (the user shouldn't see numbers they can't act on).
        $llp = $this->resolveGl('LLP', 'Loan Loss Provision');
        $allow = $this->resolveGl('ALLOW', 'Allowance for Loan Losses');

        $lines = $this->computeLines($asOf);

        $totalReq = '0.00';
        $totalPrior = '0.00';
        $totalDelta = '0.00';
        $posDelta = '0.00';
        $negDelta = '0.00';
        foreach ($lines as $l) {
            $totalReq = bcadd($totalReq, $l['provision_amount_required'], 2);
            $totalPrior = bcadd($totalPrior, $l['prior_provision_amount'], 2);
            $totalDelta = bcadd($totalDelta, $l['delta_amount'], 2);
            if (bccomp($l['delta_amount'], '0.00', 2) >= 0) {
                $posDelta = bcadd($posDelta, $l['delta_amount'], 2);
            } else {
                $negDelta = bcadd($negDelta, $l['delta_amount'], 2);
            }
        }

        return [
            'as_of'       => $asOf,
            'lines'       => $lines,
            'summary'     => [
                'loan_count'     => count($lines),
                'total_required' => $totalReq,
                'total_prior'    => $totalPrior,
                'total_delta'    => $totalDelta,
                'positive_delta' => $posDelta,
                'negative_delta' => $negDelta,
            ],
            'llp_gl_id'   => $llp->getId(),
            'allow_gl_id' => $allow->getId(),
        ];
    }

    /**
     * Post a provision run. Computes lines, persists the run + lines,
     * posts the net journal entries, returns the run summary.
     *
     * @throws DomainException
     */
    public function run(string $asOf, ?string $userId = null, ?string $notes = null): ProvisionRun
    {
        $this->assertValidDate($asOf);
        // Back-date guard — the run's journal posts at as_of date.
        // If the user is trying to re-run for a closed month, they
        // must reopen it first. (AF + AI.)
        $this->periodGuard->assertDateOpen($asOf);

        $llp = $this->resolveGl('LLP', 'Loan Loss Provision');
        $allow = $this->resolveGl('ALLOW', 'Allowance for Loan Losses');

        $lines = $this->computeLines($asOf);
        if (empty($lines)) {
            // No NPLs at all — still record the run as posted so the
            // history shows 'we checked' on that date. No journal
            // entries get created because there's nothing to post.
            return $this->persistRun($asOf, $lines, $llp, $allow, $userId, $notes, postEntries: false);
        }

        return $this->persistRun($asOf, $lines, $llp, $allow, $userId, $notes, postEntries: true);
    }

    /**
     * Reverse a posted run. Creates reversal journal entries via the
     * existing reversal pattern (mirror DR/CR under a REV-PROV-…
     * callback), flips status to REVERSED, records audit trail.
     *
     * @throws DomainException
     */
    public function reverseRun(string $runId, ?string $userId = null, ?string $reason = null): ProvisionRun
    {
        /** @var ProvisionRun|null $run */
        $run = $this->em->find(ProvisionRun::class, $runId);
        if ($run === null) {
            throw new DomainException('Provision run not found');
        }
        if ($run->isReversed()) {
            throw new DomainException('Run is already reversed');
        }
        if (!$run->isPosted()) {
            throw new DomainException('Only posted runs can be reversed');
        }

        $callback = $run->getCallbackRef();
        if ($callback === null) {
            throw new DomainException('Run has no callback — cannot auto-reverse');
        }

        // Reversal posts at today's date — use the guard so a user
        // can't reverse a provision into a closed current period.
        $this->periodGuard->assertDateOpen(date('Y-m-d'));

        $this->em->beginTransaction();
        try {
            // Reverse every ledger entry under this run's callback.
            $originals = $this->em->getRepository(LedgerTransaction::class)
                ->findBy(['transCallback' => $callback]);

            if (!empty($originals)) {
                $reversalCb = 'REV-' . $callback . '-' . date('YmdHis');
                [$y, $m, $d] = explode('-', date('Y-m-d'));
                foreach ($originals as $orig) {
                    $rev = new LedgerTransaction();
                    $rev->setGeneralLedger($orig->getGeneralLedger());
                    $rev->setCustomerLedger($orig->getCustomerLedger());
                    // Swap DR/CR
                    $rev->setTransType(
                        $orig->getTransType() === TransactionType::DR
                            ? TransactionType::CR : TransactionType::DR,
                    );
                    $rev->setTransAmount($orig->getTransAmount());
                    $rev->setTransNarration(
                        'REVERSAL: ' . ($reason ? "{$reason} — " : '')
                        . $orig->getTransNarration(),
                    );
                    $rev->setTransCallback($reversalCb);
                    $rev->setTransDate($y, $m, $d);
                    $rev->setPostedBy($userId);
                    $rev->setReversalOfId($orig->getId());
                    $this->em->persist($rev);
                }
            }

            $run->setStatus(ProvisionStatus::REVERSED);
            $run->setReversedAt(new \DateTimeImmutable());
            $run->setReversedBy($userId);
            $run->setReversalReason($reason);

            $this->em->flush();
            $this->em->commit();
        } catch (\Throwable $e) {
            if ($this->em->getConnection()->isTransactionActive()) {
                $this->em->rollback();
            }
            throw $e;
        }

        return $run;
    }

    // ─── internal helpers ──────────────────────────────────────────

    /**
     * Calculate the provision lines as of a date. Pure — doesn't
     * touch the DB beyond the read queries. Same shape used by
     * preview() and run().
     *
     * @return array<int, array> each element matches ProvisionRunLine::toArray()
     *                           shape plus a 'borrower_name' convenience field
     */
    private function computeLines(string $asOf): array
    {
        $conn = $this->em->getConnection();

        // Step 1 — find every NPL loan (any installment 90+ days late).
        // Same logic as NplScheduleAction but trimmed to what
        // provisioning needs.
        $sql = "
            SELECT
                l.id AS loan_id,
                l.application_id,
                c.full_name AS borrower_name,
                COALESCE(SUM(
                    CAST(rs.total_amount AS NUMERIC) - CAST(rs.paid_amount AS NUMERIC)
                ), 0) AS outstanding,
                COALESCE(MAX(:asOf::date - rs.due_date), 0) AS max_days_overdue
            FROM loans l
            INNER JOIN customers c ON l.customer_id = c.id
            INNER JOIN repayment_schedules rs ON rs.loan_id = l.id
            WHERE l.status IN ('active', 'overdue', 'disbursed', 'restructured')
              AND rs.status IN ('pending', 'partial', 'overdue')
              AND EXISTS (
                  SELECT 1 FROM repayment_schedules rs2
                  WHERE rs2.loan_id = l.id
                    AND rs2.status IN ('pending', 'partial', 'overdue')
                    AND :asOf::date - rs2.due_date >= 90
              )
            GROUP BY l.id, l.application_id, c.full_name
            ORDER BY max_days_overdue DESC, outstanding DESC
        ";
        $rows = $conn->executeQuery($sql, ['asOf' => $asOf])->fetchAllAssociative();
        if (empty($rows)) return [];

        // Step 2 — for each NPL, look up prior provision from the most
        // recent non-reversed run's line. A single IN-clause query
        // avoids N+1.
        $loanIds = array_column($rows, 'loan_id');
        $priors = $this->latestPriorProvisions($loanIds, $asOf);

        // Step 3 — assemble lines with classification + delta.
        $out = [];
        foreach ($rows as $r) {
            $dpd = (int) $r['max_days_overdue'];
            [$cls, $rate] = $this->classify($dpd);
            $outstanding = (string) $r['outstanding'];
            $required = bcmul($outstanding, $rate, 2);
            $prior = $priors[$r['loan_id']] ?? '0.00';
            $delta = bcsub($required, $prior, 2);

            $out[] = [
                'loan_id'                   => $r['loan_id'],
                'application_id'            => $r['application_id'],
                'borrower_name'             => $r['borrower_name'],
                'outstanding'               => $outstanding,
                'days_overdue'              => $dpd,
                'classification'            => $cls,
                'provision_rate'            => $rate,
                'provision_amount_required' => $required,
                'prior_provision_amount'    => $prior,
                'delta_amount'              => $delta,
            ];
        }
        return $out;
    }

    /**
     * Persist a run + lines + (optionally) post the journal.
     */
    private function persistRun(
        string $asOf,
        array $lines,
        GeneralLedger $llp,
        GeneralLedger $allow,
        ?string $userId,
        ?string $notes,
        bool $postEntries,
    ): ProvisionRun {
        $this->em->beginTransaction();
        try {
            $run = new ProvisionRun();
            $run->setAsOf(new \DateTimeImmutable($asOf));
            $run->setStatus(ProvisionStatus::POSTED);
            $run->setCreatedBy($userId);
            $run->setNotes($notes);

            // Roll up totals while persisting each line.
            $totalReq = '0.00';
            $totalPrior = '0.00';
            $totalDelta = '0.00';
            foreach ($lines as $l) {
                $line = new ProvisionRunLine();
                $loan = $this->em->getReference(Loan::class, $l['loan_id']);
                $line->setLoan($loan);
                $line->setApplicationIdSnapshot($l['application_id']);
                $line->setOutstandingSnapshot($l['outstanding']);
                $line->setDaysOverdueSnapshot($l['days_overdue']);
                $line->setClassification($l['classification']);
                $line->setProvisionRate($l['provision_rate']);
                $line->setProvisionAmountRequired($l['provision_amount_required']);
                $line->setPriorProvisionAmount($l['prior_provision_amount']);
                $line->setDeltaAmount($l['delta_amount']);
                $run->addLine($line);
                $this->em->persist($line);

                $totalReq = bcadd($totalReq, $l['provision_amount_required'], 2);
                $totalPrior = bcadd($totalPrior, $l['prior_provision_amount'], 2);
                $totalDelta = bcadd($totalDelta, $l['delta_amount'], 2);
            }

            $run->setTotalProvisionRequired($totalReq);
            $run->setTotalPriorProvision($totalPrior);
            $run->setTotalDeltaPosted($totalDelta);
            $run->setLoanCount(count($lines));

            if ($postEntries) {
                // Net delta — positive = new provision (DR LLP / CR ALLOW)
                // Negative = release (reverse direction)
                // Zero = skip entries entirely
                $cmp = bccomp($totalDelta, '0.00', 2);
                if ($cmp !== 0) {
                    $callback = 'PROV-' . date('Ymd') . '-' . bin2hex(random_bytes(4));
                    $run->setCallbackRef($callback);
                    [$y, $m, $d] = explode('-', $asOf);
                    $absDelta = $this->abs($totalDelta);

                    if ($cmp > 0) {
                        // New provision: DR LLP, CR ALLOW
                        $this->post($llp, TransactionType::DR, $absDelta,
                            "Provision run {$asOf}: new provision",
                            $callback, $y, $m, $d, $userId);
                        $this->post($allow, TransactionType::CR, $absDelta,
                            "Provision run {$asOf}: allowance increase",
                            $callback, $y, $m, $d, $userId);
                    } else {
                        // Release: DR ALLOW, CR LLP (reverses excess
                        // provisioning back to expense)
                        $this->post($allow, TransactionType::DR, $absDelta,
                            "Provision run {$asOf}: allowance release",
                            $callback, $y, $m, $d, $userId);
                        $this->post($llp, TransactionType::CR, $absDelta,
                            "Provision run {$asOf}: expense reduction",
                            $callback, $y, $m, $d, $userId);
                    }
                }
            }

            $this->em->persist($run);
            $this->em->flush();
            $this->em->commit();
        } catch (\Throwable $e) {
            if ($this->em->getConnection()->isTransactionActive()) {
                $this->em->rollback();
            }
            throw $e;
        }
        return $run;
    }

    /**
     * For each loan id, find the most-recent non-reversed
     * ProvisionRunLine whose run's as_of is <= $asOf. Returns a map
     * of loan_id → provision_amount_required from that line.
     *
     * One query for the whole batch — no N+1.
     *
     * @param string[] $loanIds
     * @return array<string, string>
     */
    private function latestPriorProvisions(array $loanIds, string $asOf): array
    {
        if (empty($loanIds)) return [];
        $conn = $this->em->getConnection();

        // DISTINCT ON (loan_id) with ordering gets the most recent
        // row per loan in one pass. PostgreSQL-specific — fine for
        // our stack.
        $placeholders = implode(',', array_fill(0, count($loanIds), '?'));
        $sql = "
            SELECT DISTINCT ON (l.loan_id)
                l.loan_id,
                l.provision_amount_required
            FROM provision_run_lines l
            INNER JOIN provision_runs r ON r.id = l.run_id
            WHERE l.loan_id IN ($placeholders)
              AND r.status = 'posted'
              AND r.as_of < ?
            ORDER BY l.loan_id, r.as_of DESC
        ";
        $params = array_merge($loanIds, [$asOf]);
        $rows = $conn->executeQuery($sql, $params)->fetchAllAssociative();

        $out = [];
        foreach ($rows as $r) {
            $out[$r['loan_id']] = (string) $r['provision_amount_required'];
        }
        return $out;
    }

    /**
     * Classification by days past due.
     * @return array{0: string, 1: string}  [label, rate-as-decimal-string]
     */
    private function classify(int $dpd): array
    {
        if ($dpd >= 365) return ['lost', '1.0000'];
        if ($dpd >= 180) return ['doubtful', '0.5000'];
        return ['substandard', '0.1000']; // 90-179
    }

    /**
     * Resolve a GL by code, with a LIKE-name fallback. Matches the
     * pattern used by PeriodCloseService (RETEARN lookup).
     */
    private function resolveGl(string $code, string $friendlyName): GeneralLedger
    {
        $gl = $this->em->getRepository(GeneralLedger::class)
            ->findOneBy(['accountCode' => $code]);
        if ($gl !== null) return $gl;

        throw new DomainException(
            "{$friendlyName} GL not found. Seed a GL with accountCode='{$code}' " .
            "(see seed-lite.php) before running provisioning."
        );
    }

    private function post(
        GeneralLedger $gl,
        TransactionType $type,
        string $amount,
        string $narration,
        string $callback,
        string $year,
        string $month,
        string $day,
        ?string $userId,
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

    private function assertValidDate(string $date): void
    {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            throw new DomainException('Invalid as_of date — expected YYYY-MM-DD');
        }
    }

    private function abs(string $n): string
    {
        return str_starts_with($n, '-') ? substr($n, 1) : $n;
    }
}
