<?php
declare(strict_types=1);
namespace App\Infrastructure\Service;

use App\Domain\Entity\Loan;
use App\Domain\Entity\LoanTrail;
use App\Domain\Enum\JournalEntryType;
use App\Domain\Enum\LoanStatus;
use App\Domain\Enum\RepaymentStatus;
use App\Domain\Enum\TransactionType;
use App\Domain\Exception\DomainException;
use App\Domain\Repository\CustomerLedgerRepository;
use App\Domain\Repository\GeneralLedgerRepository;
use App\Domain\Repository\RepaymentScheduleRepository;
use Doctrine\ORM\EntityManagerInterface;

/**
 * LoanPayoffService — early settlement (liquidation) of a loan.
 *
 * ## Payoff quote
 *   future principal      = principal of all not-yet-due installments
 *   current-month interest= interest of the next (current) installment only
 *                           (future months' interest is forgiven on payoff)
 *   subtotal              = future principal + current-month interest
 *   liquidation charge    = configurable (see modes below) on the subtotal
 *   arrears               = full outstanding (principal + interest) of any
 *                           already-due / overdue installments
 *   TOTAL PAYOFF          = subtotal + liquidation + arrears
 *
 * Liquidation modes (loan.liquidation_charge_mode / _value):
 *   subtotal_pct  — value × subtotal            (default)
 *   principal_pct — value × future principal
 *   flat          — value (fixed amount)
 *
 * ## Full payoff posting
 *   DR Bank (chosen payoff GL)   total received
 *   CR Loan Receivable (LR)      principal component (future + arrears principal)
 *   CR Interest Income (II)      everything else (current interest + liquidation
 *                                + arrears interest) — split into separate income
 *                                accounts later if desired.
 *
 * Partial payoff is held (no GL impact) — recorded as a trail note only.
 */
final class LoanPayoffService
{
    /** House default liquidation rate (1.2% of subtotal) when unset. */
    private const DEFAULT_LIQUIDATION_VALUE = '0.012';

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly RepaymentScheduleRepository $scheduleRepo,
        private readonly GeneralLedgerRepository $glRepo,
        private readonly CustomerLedgerRepository $clRepo,
        private readonly SettingsCacheService $settings,
        private readonly PeriodGuardService $periodGuard,
        private readonly LedgerService $ledgerService,
        private readonly GlMappingService $glMapping,
        private readonly ?NotificationDispatchService $notifService = null,
    ) {}

    /** Compute the payoff breakdown without posting. */
    public function quote(string $loanId): array
    {
        $loan = $this->loan($loanId);
        return $this->compute($loan);
    }

    /**
     * Settle a loan. mode = 'full' posts the payoff journal and closes the
     * loan; mode = 'partial' is held (no posting).
     */
    public function settle(string $loanId, string $mode, ?string $payoffGlCode, ?string $userId): array
    {
        $loan = $this->loan($loanId);
        $q = $this->compute($loan);

        if ($mode === 'partial') {
            // Hold — no GL impact yet.
            $trail = new LoanTrail();
            $trail->setUserId($userId);
            $trail->setAction('Partial payoff initiated (held) — awaiting full settlement');
            $trail->setDetails(['quote_total' => $q['total']]);
            $loan->addTrail($trail);
            $this->em->flush();
            return ['status' => 'held', 'message' => 'Partial payoff held — no posting made', 'quote' => $q];
        }

        if ($mode !== 'full') {
            throw new DomainException("Unknown payoff mode '{$mode}' — expected 'full' or 'partial'");
        }

        if (!in_array($loan->getStatus(), [LoanStatus::ACTIVE, LoanStatus::OVERDUE, LoanStatus::DISBURSED], true)) {
            throw new DomainException('Loan must be active/overdue to be paid off');
        }

        $payoffDate = date('Y-m-d');
        $this->periodGuard->assertDateOpen($payoffDate);

        $customerLedger = $this->clRepo->findByLoan($loanId);
        if ($customerLedger === null) throw new DomainException('Customer ledger not found for this loan');

        // An explicit payoff code is used verbatim; the default 'BANK' resolves
        // through the Default Ledgers mapping (settlement override, else BANK).
        $bankGl = $this->glMapping->resolveByCode($payoffGlCode !== null && $payoffGlCode !== '' ? $payoffGlCode : 'BANK');
        if ($bankGl === null) throw new DomainException('Payoff bank GL not found');
        $lrGl = $this->glMapping->resolveByCode('LR');
        $iiGl = $this->glMapping->resolveByCode('II');
        if ($lrGl === null || $iiGl === null) throw new DomainException('LR / II GL not found. Run seeder.');

        $total = $q['total'];
        $principalComponent = $q['principal_component'];
        $incomeComponent = $q['income_component'];

        $this->em->beginTransaction();
        try {
            $lines = [
                ['gl' => $bankGl, 'type' => TransactionType::DR, 'amount' => $total,
                    'narration' => 'PAYOFF received - ' . $loan->getApplicationId(), 'isRepayment' => true],
            ];
            if (bccomp($principalComponent, '0.00', 2) > 0) {
                $lines[] = ['gl' => $lrGl, 'customerLedger' => $customerLedger, 'type' => TransactionType::CR,
                    'amount' => $principalComponent, 'narration' => 'PAYOFF principal', 'isRepayment' => true];
            }
            if (bccomp($incomeComponent, '0.00', 2) > 0) {
                $lines[] = ['gl' => $iiGl, 'type' => TransactionType::CR,
                    'amount' => $incomeComponent, 'narration' => 'PAYOFF interest + liquidation', 'isRepayment' => true];
            }

            $this->ledgerService->postJournal(
                entryType: JournalEntryType::REPAYMENT,
                postingDate: $payoffDate,
                narration: 'Loan payoff — ' . $loan->getApplicationId() . ' (' . $loan->getCustomer()->getFullName() . ')',
                postedBy: $userId,
                lines: $lines,
                legacyCallback: 'PAYOFF-' . $loan->getApplicationId() . '-' . date('YmdHis'),
                reference: $loan->getApplicationId(),
            );

            // Close out the schedule + loan.
            foreach ($this->scheduleRepo->findByLoan($loanId) as $s) {
                if (in_array($s->getStatus(), [RepaymentStatus::PENDING, RepaymentStatus::PARTIAL, RepaymentStatus::OVERDUE], true)) {
                    $s->markPaid($s->getOutstanding());
                }
            }
            $loan->transitionTo(LoanStatus::CLOSED);
            $loan->setClosedAt(new \DateTimeImmutable('now', new \DateTimeZone($_ENV['APP_TIMEZONE'] ?? 'Africa/Lagos')));
            $customerLedger->close();

            $trail = new LoanTrail();
            $trail->setUserId($userId);
            $trail->setAction('Loan paid off (liquidated) and closed');
            $trail->setDetails($q);
            $loan->addTrail($trail);

            $this->em->flush();
            $this->em->commit();

            // Notify the field agent that the loan was paid off / closed
            // (in-app + push + email). Post-commit, best-effort.
            if ($this->notifService !== null) {
                try {
                    $this->notifService->notifyAgent(
                        $loan->getAgent(),
                        'Loan closed',
                        "Loan {$loan->getApplicationId()} for {$loan->getCustomer()->getFullName()} has been paid off and closed.",
                        $loan->getCustomer()->getId(),
                    );
                } catch (\Throwable $e) { /* best-effort */ }
            }

            return ['status' => 'paid_off', 'message' => 'Loan paid off and closed', 'quote' => $q];
        } catch (\Throwable $e) {
            if ($this->em->getConnection()->isTransactionActive()) $this->em->rollback();
            throw $e;
        }
    }

    // ─── internal ──────────────────────────────────────────────────

    private function compute(Loan $loan): array
    {
        $today = (new \DateTimeImmutable('today'))->format('Y-m-d');
        $schedules = $this->scheduleRepo->findByLoan($loan->getId());

        $arrearsPrincipal = '0.00';
        $arrearsInterest = '0.00';
        $futurePrincipal = '0.00';
        $currentMonthInterest = '0.00';
        $firstFutureSeen = false;

        foreach ($schedules as $s) {
            if (!in_array($s->getStatus(), [RepaymentStatus::PENDING, RepaymentStatus::PARTIAL, RepaymentStatus::OVERDUE], true)) {
                continue;
            }
            $out = $s->getOutstanding();
            if (bccomp($out, '0.00', 2) <= 0) continue;
            $total = $s->getTotalAmount();
            $ratio = bccomp($total, '0.00', 2) > 0 ? bcdiv($out, $total, 6) : '1';
            $prOut = bcmul($s->getPrincipalAmount(), $ratio, 2);
            $intOut = bcsub($out, $prOut, 2);
            $due = $s->getDueDate()->format('Y-m-d');

            if ($due <= $today) {
                // Arrears — full P+I owed.
                $arrearsPrincipal = bcadd($arrearsPrincipal, $prOut, 2);
                $arrearsInterest = bcadd($arrearsInterest, $intOut, 2);
            } else {
                // Future — principal owed; only the FIRST future installment's
                // interest (the current month) is charged.
                $futurePrincipal = bcadd($futurePrincipal, $prOut, 2);
                if (!$firstFutureSeen) {
                    $currentMonthInterest = bcadd($currentMonthInterest, $intOut, 2);
                    $firstFutureSeen = true;
                }
            }
        }

        $subtotal = bcadd($futurePrincipal, $currentMonthInterest, 2);
        $liquidation = $this->liquidation($subtotal, $futurePrincipal);
        $arrearsTotal = bcadd($arrearsPrincipal, $arrearsInterest, 2);
        $total = bcadd(bcadd($subtotal, $liquidation, 2), $arrearsTotal, 2);

        $principalComponent = bcadd($futurePrincipal, $arrearsPrincipal, 2);
        $incomeComponent = bcadd(bcadd($currentMonthInterest, $liquidation, 2), $arrearsInterest, 2);

        return [
            'loan_id'                => $loan->getId(),
            'application_id'         => $loan->getApplicationId(),
            'future_principal'       => $futurePrincipal,
            'current_month_interest' => $currentMonthInterest,
            'subtotal'               => $subtotal,
            'liquidation_charge'     => $liquidation,
            'liquidation_mode'       => (string) $this->settings->get('loan.liquidation_charge_mode', 'subtotal_pct'),
            'liquidation_value'      => (string) $this->settings->get('loan.liquidation_charge_value', self::DEFAULT_LIQUIDATION_VALUE),
            'arrears_principal'      => $arrearsPrincipal,
            'arrears_interest'       => $arrearsInterest,
            'arrears_total'          => $arrearsTotal,
            'total'                  => $total,
            'principal_component'    => $principalComponent,
            'income_component'       => $incomeComponent,
        ];
    }

    private function liquidation(string $subtotal, string $futurePrincipal): string
    {
        $mode = (string) $this->settings->get('loan.liquidation_charge_mode', 'subtotal_pct');
        $value = (string) $this->settings->get('loan.liquidation_charge_value', self::DEFAULT_LIQUIDATION_VALUE);
        if (!is_numeric($value)) $value = '0';
        return match ($mode) {
            'flat'          => $this->money($value),
            'principal_pct' => $this->money(bcmul($futurePrincipal, $value, 6)),
            default         => $this->money(bcmul($subtotal, $value, 6)), // subtotal_pct
        };
    }

    private function loan(string $loanId): Loan
    {
        $loan = $this->em->find(Loan::class, $loanId);
        if ($loan === null) throw new DomainException('Loan not found');
        return $loan;
    }

    private function money(string $v): string { return number_format((float) $v, 2, '.', ''); }
}
