<?php

declare(strict_types=1);

namespace App\Infrastructure\Service;

use App\Domain\Entity\Investment;
use App\Domain\Entity\InvestmentProduct;
use App\Domain\Entity\InvestmentTransaction;
use App\Domain\Entity\GeneralLedger;
use App\Domain\Enum\InvestmentPayoutMode;
use App\Domain\Enum\InvestmentStatus;
use App\Domain\Enum\InvestmentTransactionType;
use App\Domain\Enum\InvestmentType;
use App\Domain\Enum\JournalEntryType;
use App\Domain\Enum\TransactionType;
use App\Domain\Exception\DomainException;
use App\Domain\Repository\CustomerRepository;
use App\Domain\Repository\GeneralLedgerRepository;
use App\Domain\Repository\InvestmentRepository;
use App\Domain\Repository\InvestmentTransactionRepository;
use Doctrine\ORM\EntityManagerInterface;

/**
 * InvestmentService — places, accrues, and settles customer investments,
 * keeping the investment sub-ledger (Investment.balance + InvestmentTransaction
 * rows) in lockstep with the GL through LedgerService::postJournal.
 *
 * GL roles (via the Default Ledgers mapping):
 *   Investment Liability (INVLIAB)          — principal + capitalised interest owed
 *   Investment Interest Expense (INVINTEXP) — interest recognised as it accrues
 *   WHT Payable (WHTPAY)                     — 10% withholding parked for FIRS
 * Settlement is the operator-chosen bank/cash GL, passed per transaction (like
 * loan disbursement) — not a fixed role.
 *
 * Interest = balance × annualRate × days ÷ dayCountBasis, recognised at each
 * period boundary. WHT is deducted whenever interest is CREDITED to the
 * investor — at payout (periodic), capitalisation (compounded), or settlement
 * (at-maturity). Expense is recognised as it accrues in all modes.
 *
 * Postings per event (S = settlement, L = liability, E = interest expense, W = WHT):
 *   placement / top-up   DR S              CR L
 *   accrual (at-mat)     DR E (gross)      CR L (gross)
 *   payout (periodic)    DR E (gross)      CR S (net) + CR W (wht)
 *   capitalise (comp)    DR E (gross)      CR L (net) + CR W (wht)
 *   maturity (at-mat)    DR L (prin+gross) CR S (prin+net) + CR W (wht)
 *   maturity (periodic)  DR L (balance)    CR S (balance)
 *   maturity (comp)      DR L (balance)    CR S (balance)   [WHT already taken]
 *   withdrawal (open)    DR L              CR S
 *   liquidation (fixed)  forfeit penalty of accrued interest, pay principal +
 *                        net of the rest (see liquidate()).
 */
final class InvestmentService
{
    /** Below one kobo isn't worth a journal. */
    private const MIN_POSTABLE = '0.01';

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly InvestmentRepository $investmentRepo,
        private readonly InvestmentTransactionRepository $txnRepo,
        private readonly CustomerRepository $customerRepo,
        private readonly GeneralLedgerRepository $glRepo,
        private readonly GlMappingService $glMapping,
        private readonly PeriodGuardService $periodGuard,
        private readonly LedgerService $ledger,
        private readonly ?\Psr\Log\LoggerInterface $logger = null,
    ) {}

    // ── Placement ────────────────────────────────────────────────────────────

    /**
     * Place a new investment. Snapshots the product's terms so later product
     * edits never change this investment.
     *
     * @param int|null $tenorDays required for fixed-term, ignored for open-ended
     */
    public function place(
        InvestmentProduct $product,
        string $customerId,
        string $amount,
        ?int $tenorDays,
        string $placementDate,
        string $settlementGlId,
        ?string $userId,
        ?bool $autoRolloverOverride = null,
        ?string $payoutDepositAccountId = null,
        ?string $rolledFromId = null,
    ): Investment {
        $this->assertDate($placementDate);
        if (!$product->isActive()) {
            throw new DomainException("Investment product {$product->getCode()} is inactive.");
        }
        $amount = $this->money($amount);
        if (bccomp($amount, '0.00', 2) <= 0) {
            throw new DomainException('Investment amount must be greater than zero.');
        }
        if (bccomp($amount, $product->getMinAmount(), 2) < 0) {
            throw new DomainException(sprintf('Amount %s is below the product minimum %s.', $amount, $product->getMinAmount()));
        }

        $customer = $this->customerRepo->find($customerId);
        if ($customer === null) {
            throw new DomainException('Customer not found.');
        }

        $placement = new \DateTimeImmutable($placementDate);
        $isFixed = $product->getType() === InvestmentType::FIXED_TERM;
        $maturity = null;
        if ($isFixed) {
            if ($tenorDays === null || $tenorDays <= 0) {
                throw new DomainException('A fixed-term investment requires a positive tenor (days).');
            }
            $min = $product->getMinTenorDays();
            $max = $product->getMaxTenorDays();
            if ($min !== null && $tenorDays < $min) {
                throw new DomainException("Tenor {$tenorDays}d is below the product minimum {$min}d.");
            }
            if ($max !== null && $tenorDays > $max) {
                throw new DomainException("Tenor {$tenorDays}d exceeds the product maximum {$max}d.");
            }
            $maturity = $placement->modify("+{$tenorDays} days");
        } else {
            // Open-ended: no tenor, no maturity — it runs until the investor
            // withdraws or closes it.
            $tenorDays = null;
            // AT_MATURITY is meaningless without a maturity date: interest would
            // accrue into the liability forever with nothing to trigger
            // settlement, trapping the investor's earnings. Refuse rather than
            // silently re-mapping the terms the product promised.
            if ($product->getPayoutMode() === InvestmentPayoutMode::AT_MATURITY) {
                throw new DomainException(
                    "Product {$product->getCode()} is open-ended but its payout mode is 'at maturity', which has no "
                  . 'maturity to pay out on. Set the product to periodic or compounded payout.'
                );
            }
        }

        $settlementGl = $this->settlementGl($settlementGlId);
        $liabilityGl = $this->role(GlMappingRegistry::INVESTMENT_LIABILITY);

        $this->periodGuard->assertDateOpen($placementDate);
        $this->em->beginTransaction();
        try {
            $inv = new Investment();
            $inv->setInvestmentNumber($this->uniqueNumber());
            $inv->setCustomer($customer);
            $inv->setProduct($product);
            // Snapshot terms.
            $inv->setType($product->getType());
            $inv->setInterestRate($product->getInterestRate());
            // Open-ended honours the product's mode too (periodic = income fund,
            // compounded = growth fund); only AT_MATURITY is excluded above.
            $inv->setPayoutMode($product->getPayoutMode());
            $inv->setPayoutFrequency($product->getPayoutFrequency());
            $inv->setTenorDays($tenorDays);
            $inv->setWhtRate($product->getWhtRate());
            $inv->setEarlyLiquidationPenaltyRate($product->getEarlyLiquidationPenaltyRate());
            $inv->setDayCountBasis($product->getDayCountBasis());
            $inv->setAutoRollover($autoRolloverOverride ?? $product->isAutoRollover());
            $inv->setPrincipal($amount);
            $inv->setBalance($amount);
            $inv->setStatus(InvestmentStatus::ACTIVE);
            $inv->setPlacementDate($placement);
            $inv->setMaturityDate($maturity);
            $inv->setLastAccrualDate($placement);
            $inv->setNextPayoutDate($this->firstPeriodEnd($inv));
            $inv->setPayoutDepositAccountId($payoutDepositAccountId);
            $inv->setRolledFromId($rolledFromId);
            $inv->setCreatedBy($userId);
            $this->em->persist($inv);

            // DR settlement, CR liability (principal in).
            $journal = $this->ledger->postJournal(
                entryType: JournalEntryType::INVESTMENT_PLACEMENT,
                postingDate: $placementDate,
                narration: sprintf('Investment placement — %s (%s)', $inv->getInvestmentNumber(), $customer->getFullName()),
                postedBy: $userId,
                lines: [
                    ['gl' => $settlementGl, 'type' => TransactionType::DR, 'amount' => $amount, 'narration' => 'INVESTMENT PLACEMENT'],
                    ['gl' => $liabilityGl,  'type' => TransactionType::CR, 'amount' => $amount, 'narration' => 'INVESTMENT LIABILITY - ' . $customer->getFullName()],
                ],
                reference: $inv->getInvestmentNumber(),
            );

            $this->record($inv, InvestmentTransactionType::PLACEMENT, $amount, $placement, 'Principal placed', $journal->getId(), $userId);

            $this->em->flush();
            $this->em->commit();
            return $inv;
        } catch (\Throwable $e) {
            $this->em->rollback();
            throw $e;
        }
    }

    // ── Top-up / withdrawal (open-ended) ──────────────────────────────────────

    public function topUp(Investment $inv, string $amount, string $date, string $settlementGlId, ?string $userId): InvestmentTransaction
    {
        $this->assertActive($inv);
        if ($inv->getType() !== InvestmentType::OPEN_ENDED || !$inv->getProduct()->isTopUpAllowed()) {
            throw new DomainException('Top-ups are only allowed on open-ended products that permit them.');
        }
        $this->assertDate($date);
        $amount = $this->money($amount);
        if (bccomp($amount, '0.00', 2) <= 0) {
            throw new DomainException('Top-up amount must be greater than zero.');
        }

        $settlementGl = $this->settlementGl($settlementGlId);
        $liabilityGl = $this->role(GlMappingRegistry::INVESTMENT_LIABILITY);
        $this->periodGuard->assertDateOpen($date);

        $this->em->beginTransaction();
        try {
            // Recognise interest up to the top-up date first (whole periods +
            // the part period), so the new money doesn't earn for the days
            // before it arrived and the old balance earns to the day.
            $this->accrueToDate($inv, $date, $settlementGlId, $userId);

            $journal = $this->ledger->postJournal(
                entryType: JournalEntryType::INVESTMENT_PLACEMENT,
                postingDate: $date,
                narration: sprintf('Investment top-up — %s', $inv->getInvestmentNumber()),
                postedBy: $userId,
                lines: [
                    ['gl' => $settlementGl, 'type' => TransactionType::DR, 'amount' => $amount, 'narration' => 'INVESTMENT TOP-UP'],
                    ['gl' => $liabilityGl,  'type' => TransactionType::CR, 'amount' => $amount, 'narration' => 'INVESTMENT LIABILITY'],
                ],
                reference: $inv->getInvestmentNumber(),
            );

            $inv->setPrincipal(bcadd($inv->getPrincipal(), $amount, 2));
            $inv->setBalance(bcadd($inv->getBalance(), $amount, 2));
            $inv->setUpdatedBy($userId);
            $txn = $this->record($inv, InvestmentTransactionType::TOP_UP, $amount, new \DateTimeImmutable($date), 'Top-up', $journal->getId(), $userId);

            $this->em->flush();
            $this->em->commit();
            return $txn;
        } catch (\Throwable $e) {
            $this->em->rollback();
            throw $e;
        }
    }

    public function withdraw(Investment $inv, string $amount, string $date, string $settlementGlId, ?string $userId, bool $closeIfZero = false): InvestmentTransaction
    {
        $this->assertActive($inv);
        if ($inv->getType() !== InvestmentType::OPEN_ENDED) {
            throw new DomainException('Only open-ended investments allow withdrawals; a fixed-term investment is liquidated instead.');
        }
        $this->assertDate($date);
        $amount = $this->money($amount);
        if (bccomp($amount, '0.00', 2) <= 0) {
            throw new DomainException('Withdrawal amount must be greater than zero.');
        }

        $settlementGl = $this->settlementGl($settlementGlId);
        $liabilityGl = $this->role(GlMappingRegistry::INVESTMENT_LIABILITY);
        $this->periodGuard->assertDateOpen($date);

        $this->em->beginTransaction();
        try {
            // Earn to the actual day of withdrawal, not just the last boundary.
            $this->accrueToDate($inv, $date, $settlementGlId, $userId);

            if (bccomp($amount, $inv->getBalance(), 2) > 0) {
                throw new DomainException(sprintf('Withdrawal %s exceeds the available balance %s.', $amount, $inv->getBalance()));
            }

            $journal = $this->ledger->postJournal(
                entryType: JournalEntryType::INVESTMENT_WITHDRAWAL,
                postingDate: $date,
                narration: sprintf('Investment withdrawal — %s', $inv->getInvestmentNumber()),
                postedBy: $userId,
                lines: [
                    ['gl' => $liabilityGl,  'type' => TransactionType::DR, 'amount' => $amount, 'narration' => 'INVESTMENT WITHDRAWAL'],
                    ['gl' => $settlementGl, 'type' => TransactionType::CR, 'amount' => $amount, 'narration' => 'INVESTMENT WITHDRAWAL'],
                ],
                reference: $inv->getInvestmentNumber(),
            );

            $inv->setBalance(bcsub($inv->getBalance(), $amount, 2));
            $inv->setUpdatedBy($userId);
            $txn = $this->record($inv, InvestmentTransactionType::WITHDRAWAL, $amount, new \DateTimeImmutable($date), 'Withdrawal', $journal->getId(), $userId);

            if ($closeIfZero && bccomp($inv->getBalance(), '0.00', 2) === 0 && bccomp($inv->getAccruedInterest(), '0.00', 2) === 0) {
                $inv->setStatus(InvestmentStatus::CLOSED);
                $inv->setClosedDate(new \DateTimeImmutable($date));
            }

            $this->em->flush();
            $this->em->commit();
            return $txn;
        } catch (\Throwable $e) {
            $this->em->rollback();
            throw $e;
        }
    }

    // ── Accrual engine ────────────────────────────────────────────────────────

    /**
     * Recognise interest at every period boundary from the last accrual up to
     * $asOf (capped at maturity for fixed-term). Behaviour per payout mode:
     *   AT_MATURITY  accrue expense into the liability; no cash, no WHT yet.
     *   PERIODIC     pay net interest to settlement, park WHT.
     *   COMPOUNDED   capitalise net interest into balance, park WHT.
     *
     * @param bool $inner true when called inside another method's open transaction.
     * @return array{periods:int, gross:string, wht:string, net:string}
     */
    public function accrueThrough(Investment $inv, string $asOf, string $settlementGlId, ?string $userId, bool $inner = false): array
    {
        $this->assertDate($asOf);
        if (!$inv->isActive()) {
            return ['periods' => 0, 'gross' => '0.00', 'wht' => '0.00', 'net' => '0.00'];
        }
        $asOfDate = new \DateTimeImmutable($asOf);
        $cap = $inv->isFixedTerm() && $inv->getMaturityDate() !== null
            ? min($asOfDate, $inv->getMaturityDate())
            : $asOfDate;

        $settlementGl = $this->settlementGl($settlementGlId);
        $liabilityGl  = $this->role(GlMappingRegistry::INVESTMENT_LIABILITY);
        $expenseGl    = $this->role(GlMappingRegistry::INVESTMENT_INTEREST_EXPENSE);
        $whtGl        = $this->role(GlMappingRegistry::WHT_PAYABLE);

        $run = fn() => $this->runAccrual($inv, $cap, $settlementGl, $liabilityGl, $expenseGl, $whtGl, $userId);

        if ($inner) {
            return $run();
        }
        $this->em->beginTransaction();
        try {
            $r = $run();
            $this->em->flush();
            $this->em->commit();
            return $r;
        } catch (\Throwable $e) {
            $this->em->rollback();
            throw $e;
        }
    }

    /** The boundary loop. Must run inside a transaction. */
    private function runAccrual(Investment $inv, \DateTimeImmutable $cap, GeneralLedger $settlementGl, GeneralLedger $liabilityGl, GeneralLedger $expenseGl, GeneralLedger $whtGl, ?string $userId): array
    {
        $periods = 0;
        $sumGross = '0.00'; $sumWht = '0.00'; $sumNet = '0.00';

        while ($inv->getNextPayoutDate() !== null && $inv->getNextPayoutDate() <= $cap) {
            $start = $inv->getLastAccrualDate() ?? $inv->getPlacementDate();
            $end   = $inv->getNextPayoutDate();
            $days  = $this->days($start, $end);
            if ($days <= 0) { // defensive — never advance zero-width periods
                $inv->setNextPayoutDate($this->advance($inv, $end));
                continue;
            }

            $r = $this->postInterestFor($inv, $days, $end, false, $settlementGl, $liabilityGl, $expenseGl, $whtGl, $userId);
            if ($r !== null) {
                $periods++;
                $sumGross = bcadd($sumGross, $r['gross'], 2);
                $sumWht   = bcadd($sumWht, $r['wht'], 2);
                $sumNet   = bcadd($sumNet, $r['net'], 2);
            }

            $inv->setLastAccrualDate($end);
            $inv->setNextPayoutDate($this->advance($inv, $end));
        }

        $inv->setUpdatedBy($userId);
        return ['periods' => $periods, 'gross' => $sumGross, 'wht' => $sumWht, 'net' => $sumNet];
    }

    /**
     * Accrue the PARTIAL period from the last accrual up to $asOf, without
     * advancing the period boundary.
     *
     * Whole-period accrual alone would short-change an investor who exits
     * mid-period: an open-ended withdrawal (or an early liquidation) on day 45
     * of a monthly cycle would earn nothing for days 31–45. This credits
     * interest to the actual day, which is the accurate treatment. The next
     * whole period then runs from $asOf, so nothing is double-counted.
     *
     * Must run inside a transaction.
     *
     * @return array{gross:string, wht:string, net:string}
     */
    private function accrueStub(Investment $inv, \DateTimeImmutable $asOf, GeneralLedger $settlementGl, GeneralLedger $liabilityGl, GeneralLedger $expenseGl, GeneralLedger $whtGl, ?string $userId): array
    {
        $zero = ['gross' => '0.00', 'wht' => '0.00', 'net' => '0.00'];
        if (!$inv->isActive()) {
            return $zero;
        }
        // Never accrue past maturity — the boundary loop already caps there.
        $end = $inv->isFixedTerm() && $inv->getMaturityDate() !== null && $asOf > $inv->getMaturityDate()
            ? $inv->getMaturityDate()
            : $asOf;

        $start = $inv->getLastAccrualDate() ?? $inv->getPlacementDate();
        $days = $this->days($start, $end);
        if ($days <= 0) {
            return $zero;
        }

        $r = $this->postInterestFor($inv, $days, $end, true, $settlementGl, $liabilityGl, $expenseGl, $whtGl, $userId);
        // Move the accrual watermark so the next whole period starts here.
        $inv->setLastAccrualDate($end);
        $inv->setUpdatedBy($userId);

        return $r ?? $zero;
    }

    /**
     * Recognise interest for one window of $days ending $end, per payout mode.
     * Shared by the whole-period loop and the partial-period stub so both post
     * identically. Returns null when the amount is below the posting floor.
     *
     * @return array{gross:string, wht:string, net:string}|null
     */
    private function postInterestFor(
        Investment $inv,
        int $days,
        \DateTimeImmutable $end,
        bool $isStub,
        GeneralLedger $settlementGl,
        GeneralLedger $liabilityGl,
        GeneralLedger $expenseGl,
        GeneralLedger $whtGl,
        ?string $userId,
    ): ?array {
        $gross = $this->interest($inv->getBalance(), $inv->getInterestRate(), $days, $inv->getDayCountBasis());
        if (bccomp($gross, self::MIN_POSTABLE, 2) < 0) {
            return null;
        }
        $date = $end->format('Y-m-d');
        $suffix = $isStub ? sprintf(' (%d-day part period)', $days) : '';

        switch ($inv->getPayoutMode()) {
            case InvestmentPayoutMode::AT_MATURITY:
                // Build the liability; settle (with WHT) at maturity.
                $journal = $this->ledger->postJournal(
                    entryType: JournalEntryType::INVESTMENT_INTEREST,
                    postingDate: $date,
                    narration: sprintf('Investment interest accrual — %s%s', $inv->getInvestmentNumber(), $suffix),
                    postedBy: $userId,
                    lines: [
                        ['gl' => $expenseGl,   'type' => TransactionType::DR, 'amount' => $gross, 'narration' => 'INVESTMENT INTEREST ACCRUAL'],
                        ['gl' => $liabilityGl, 'type' => TransactionType::CR, 'amount' => $gross, 'narration' => 'INVESTMENT INTEREST ACCRUED'],
                    ],
                    reference: $inv->getInvestmentNumber(),
                );
                $inv->setAccruedInterest(bcadd($inv->getAccruedInterest(), $gross, 2));
                $inv->setInterestEarnedToDate(bcadd($inv->getInterestEarnedToDate(), $gross, 2));
                $this->record($inv, InvestmentTransactionType::ACCRUAL, $gross, $end, 'Interest accrued' . $suffix, $journal->getId(), $userId, $gross, '0.00', $gross);
                return ['gross' => $gross, 'wht' => '0.00', 'net' => '0.00'];

            case InvestmentPayoutMode::PERIODIC:
                [$wht, $net] = $this->splitWht($gross, $inv->getWhtRate());
                $lines = [['gl' => $expenseGl, 'type' => TransactionType::DR, 'amount' => $gross, 'narration' => 'INVESTMENT INTEREST']];
                $lines[] = ['gl' => $settlementGl, 'type' => TransactionType::CR, 'amount' => $net, 'narration' => 'INTEREST PAID (NET)'];
                if (bccomp($wht, '0.00', 2) > 0) {
                    $lines[] = ['gl' => $whtGl, 'type' => TransactionType::CR, 'amount' => $wht, 'narration' => 'WHT ON INVESTMENT INTEREST'];
                }
                $journal = $this->ledger->postJournal(
                    entryType: JournalEntryType::INVESTMENT_PAYOUT,
                    postingDate: $date,
                    narration: sprintf('Investment interest payout — %s%s', $inv->getInvestmentNumber(), $suffix),
                    postedBy: $userId,
                    lines: $lines,
                    reference: $inv->getInvestmentNumber(),
                );
                $inv->setInterestEarnedToDate(bcadd($inv->getInterestEarnedToDate(), $gross, 2));
                $inv->setInterestPaidToDate(bcadd($inv->getInterestPaidToDate(), $net, 2));
                $inv->setWhtWithheldToDate(bcadd($inv->getWhtWithheldToDate(), $wht, 2));
                $this->record($inv, InvestmentTransactionType::PAYOUT, $gross, $end, 'Interest paid out' . $suffix, $journal->getId(), $userId, $gross, $wht, $net);
                return ['gross' => $gross, 'wht' => $wht, 'net' => $net];

            case InvestmentPayoutMode::COMPOUNDED:
                [$wht, $net] = $this->splitWht($gross, $inv->getWhtRate());
                $lines = [['gl' => $expenseGl, 'type' => TransactionType::DR, 'amount' => $gross, 'narration' => 'INVESTMENT INTEREST']];
                $lines[] = ['gl' => $liabilityGl, 'type' => TransactionType::CR, 'amount' => $net, 'narration' => 'INTEREST CAPITALISED (NET)'];
                if (bccomp($wht, '0.00', 2) > 0) {
                    $lines[] = ['gl' => $whtGl, 'type' => TransactionType::CR, 'amount' => $wht, 'narration' => 'WHT ON INVESTMENT INTEREST'];
                }
                $journal = $this->ledger->postJournal(
                    entryType: JournalEntryType::INVESTMENT_INTEREST,
                    postingDate: $date,
                    narration: sprintf('Investment interest capitalised — %s%s', $inv->getInvestmentNumber(), $suffix),
                    postedBy: $userId,
                    lines: $lines,
                    reference: $inv->getInvestmentNumber(),
                );
                $inv->setBalance(bcadd($inv->getBalance(), $net, 2));
                $inv->setInterestEarnedToDate(bcadd($inv->getInterestEarnedToDate(), $gross, 2));
                $inv->setInterestPaidToDate(bcadd($inv->getInterestPaidToDate(), $net, 2));
                $inv->setWhtWithheldToDate(bcadd($inv->getWhtWithheldToDate(), $wht, 2));
                $this->record($inv, InvestmentTransactionType::CAPITALISATION, $gross, $end, 'Interest capitalised' . $suffix, $journal->getId(), $userId, $gross, $wht, $net);
                return ['gross' => $gross, 'wht' => $wht, 'net' => $net];
        }

        return null;
    }

    /**
     * Whole periods PLUS the partial period up to $asOf. This is what every
     * exit path (withdrawal, close, liquidation) uses so the investor earns to
     * the actual day. Must run inside a transaction.
     *
     * @return array{periods:int, gross:string, wht:string, net:string}
     */
    private function accrueToDate(Investment $inv, string $asOf, string $settlementGlId, ?string $userId): array
    {
        $r = $this->accrueThrough($inv, $asOf, $settlementGlId, $userId, true);
        $stub = $this->accrueStub(
            $inv,
            new \DateTimeImmutable($asOf),
            $this->settlementGl($settlementGlId),
            $this->role(GlMappingRegistry::INVESTMENT_LIABILITY),
            $this->role(GlMappingRegistry::INVESTMENT_INTEREST_EXPENSE),
            $this->role(GlMappingRegistry::WHT_PAYABLE),
            $userId,
        );
        return [
            'periods' => $r['periods'] + (bccomp($stub['gross'], '0.00', 2) > 0 ? 1 : 0),
            'gross'   => bcadd($r['gross'], $stub['gross'], 2),
            'wht'     => bcadd($r['wht'], $stub['wht'], 2),
            'net'     => bcadd($r['net'], $stub['net'], 2),
        ];
    }

    /**
     * Accrue every active investment up to $asOf — the periodic run an operator
     * (or the scheduled sweep) triggers.
     *
     * All-or-nothing in ONE transaction, matching OverdueService and
     * PeriodCloseService: a partially-applied interest run is far worse to
     * reconcile than a failed one. The offending investment is named in the
     * error so the operator can fix it (usually an unmapped GL) and re-run.
     *
     * @param bool $preview compute only — roll back without posting.
     * @return array{as_of:string, investments:int, periods:int, gross:string, wht:string, net:string, lines:array<int,array<string,mixed>>}
     */
    public function accrueAll(string $asOf, string $settlementGlId, ?string $userId, bool $preview = false): array
    {
        $this->assertDate($asOf);
        $active = $this->investmentRepo->findActive();

        $totals = ['periods' => 0, 'gross' => '0.00', 'wht' => '0.00', 'net' => '0.00'];
        $lines = [];
        $touched = 0;

        $this->em->beginTransaction();
        try {
            foreach ($active as $inv) {
                try {
                    $r = $this->accrueThrough($inv, $asOf, $settlementGlId, $userId, /* inner */ true);
                } catch (\Throwable $e) {
                    throw new DomainException(sprintf(
                        'Accrual failed on investment %s: %s',
                        $inv->getInvestmentNumber(),
                        $e->getMessage(),
                    ), 0, $e);
                }
                if ($r['periods'] === 0) {
                    continue;
                }
                $touched++;
                $totals['periods'] += $r['periods'];
                foreach (['gross', 'wht', 'net'] as $k) {
                    $totals[$k] = bcadd($totals[$k], $r[$k], 2);
                }
                $lines[] = [
                    'investment_id'     => $inv->getId(),
                    'investment_number' => $inv->getInvestmentNumber(),
                    'customer_name'     => $inv->getCustomer()->getFullName(),
                    'payout_mode'       => $inv->getPayoutMode()->value,
                    'periods'           => $r['periods'],
                    'gross'             => $r['gross'],
                    'wht'               => $r['wht'],
                    'net'               => $r['net'],
                    'balance_after'     => $inv->getBalance(),
                ];
            }

            $this->em->flush();
            if ($preview) {
                // Nothing is kept — the caller only wanted the numbers.
                $this->em->rollback();
                $this->em->clear();
            } else {
                $this->em->commit();
            }
        } catch (\Throwable $e) {
            $this->em->rollback();
            throw $e;
        }

        return [
            'as_of'       => $asOf,
            'preview'     => $preview,
            'investments' => $touched,
            'periods'     => $totals['periods'],
            'gross'       => $totals['gross'],
            'wht'         => $totals['wht'],
            'net'         => $totals['net'],
            'lines'       => $lines,
        ];
    }

    // ── Maturity & liquidation ────────────────────────────────────────────────

    /**
     * Settle a fixed-term investment at (or after) maturity: accrue through the
     * maturity date, then pay principal + interest per payout mode.
     */
    public function mature(Investment $inv, string $settlementGlId, ?string $userId, ?string $onDate = null): Investment
    {
        $this->assertActive($inv);
        if (!$inv->isFixedTerm() || $inv->getMaturityDate() === null) {
            throw new DomainException('Only a fixed-term investment can be matured.');
        }
        $date = $onDate ?? $inv->getMaturityDate()->format('Y-m-d');
        $this->assertDate($date);
        $this->periodGuard->assertDateOpen($date);

        $settlementGl = $this->settlementGl($settlementGlId);
        $liabilityGl  = $this->role(GlMappingRegistry::INVESTMENT_LIABILITY);
        $whtGl        = $this->role(GlMappingRegistry::WHT_PAYABLE);

        $this->em->beginTransaction();
        try {
            // Accrue right up to maturity first.
            $this->accrueThrough($inv, $inv->getMaturityDate()->format('Y-m-d'), $settlementGlId, $userId, true);

            $principal = $inv->getBalance();       // for compounded this already holds capitalised interest
            $accrued   = $inv->getAccruedInterest();

            if ($inv->getPayoutMode() === InvestmentPayoutMode::AT_MATURITY && bccomp($accrued, '0.00', 2) > 0) {
                // Liability holds principal + gross accrued; pay principal + net, park WHT.
                [$wht, $net] = $this->splitWht($accrued, $inv->getWhtRate());
                $gross = bcadd($principal, $accrued, 2);
                $cashOut = bcadd($principal, $net, 2);
                $lines = [['gl' => $liabilityGl, 'type' => TransactionType::DR, 'amount' => $gross, 'narration' => 'INVESTMENT MATURITY']];
                $lines[] = ['gl' => $settlementGl, 'type' => TransactionType::CR, 'amount' => $cashOut, 'narration' => 'MATURITY PROCEEDS (NET)'];
                if (bccomp($wht, '0.00', 2) > 0) {
                    $lines[] = ['gl' => $whtGl, 'type' => TransactionType::CR, 'amount' => $wht, 'narration' => 'WHT ON INVESTMENT INTEREST'];
                }
                $journal = $this->ledger->postJournal(
                    entryType: JournalEntryType::INVESTMENT_PAYOUT,
                    postingDate: $date,
                    narration: sprintf('Investment maturity — %s', $inv->getInvestmentNumber()),
                    postedBy: $userId,
                    lines: $lines,
                    reference: $inv->getInvestmentNumber(),
                );
                $inv->setInterestPaidToDate(bcadd($inv->getInterestPaidToDate(), $net, 2));
                $inv->setWhtWithheldToDate(bcadd($inv->getWhtWithheldToDate(), $wht, 2));
                $inv->setAccruedInterest('0.00');
                $this->record($inv, InvestmentTransactionType::MATURITY, $gross, new \DateTimeImmutable($date), 'Matured — principal + net interest', $journal->getId(), $userId, $accrued, $wht, $net);
            } else {
                // Periodic / compounded: interest already settled; return the balance.
                $journal = $this->ledger->postJournal(
                    entryType: JournalEntryType::INVESTMENT_PAYOUT,
                    postingDate: $date,
                    narration: sprintf('Investment maturity — %s', $inv->getInvestmentNumber()),
                    postedBy: $userId,
                    lines: [
                        ['gl' => $liabilityGl,  'type' => TransactionType::DR, 'amount' => $principal, 'narration' => 'INVESTMENT MATURITY'],
                        ['gl' => $settlementGl, 'type' => TransactionType::CR, 'amount' => $principal, 'narration' => 'MATURITY PROCEEDS'],
                    ],
                    reference: $inv->getInvestmentNumber(),
                );
                $this->record($inv, InvestmentTransactionType::MATURITY, $principal, new \DateTimeImmutable($date), 'Matured — principal returned', $journal->getId(), $userId);
            }

            $inv->setBalance('0.00');
            $inv->setStatus(InvestmentStatus::MATURED);
            $inv->setClosedDate(new \DateTimeImmutable($date));
            $inv->setNextPayoutDate(null);
            $inv->setUpdatedBy($userId);

            $this->em->flush();
            $this->em->commit();
            return $inv;
        } catch (\Throwable $e) {
            $this->em->rollback();
            throw $e;
        }
    }

    /**
     * Close an open-ended investment: accrue to the actual closing date, then
     * return the whole balance (plus any unsettled interest, net of WHT) and
     * mark it CLOSED.
     *
     * This is the open-ended counterpart to mature(). There is no maturity to
     * reach and no early-exit penalty — the investor can leave whenever they
     * like, which is the point of an open-ended investment.
     */
    public function close(Investment $inv, string $date, string $settlementGlId, ?string $userId): Investment
    {
        $this->assertActive($inv);
        if ($inv->isFixedTerm()) {
            throw new DomainException('A fixed-term investment is matured or liquidated, not closed.');
        }
        $this->assertDate($date);
        $this->periodGuard->assertDateOpen($date);

        $settlementGl = $this->settlementGl($settlementGlId);
        $liabilityGl  = $this->role(GlMappingRegistry::INVESTMENT_LIABILITY);
        $whtGl        = $this->role(GlMappingRegistry::WHT_PAYABLE);

        $this->em->beginTransaction();
        try {
            $this->accrueToDate($inv, $date, $settlementGlId, $userId);

            $principal = $inv->getBalance();
            $accrued   = $inv->getAccruedInterest(); // normally 0 — periodic pays, compounded capitalises
            [$wht, $netInterest] = bccomp($accrued, '0.00', 2) > 0
                ? $this->splitWht($accrued, $inv->getWhtRate())
                : ['0.00', '0.00'];

            $liabilityHeld = bcadd($principal, $accrued, 2);
            $cashOut = bcadd($principal, $netInterest, 2);

            if (bccomp($liabilityHeld, '0.00', 2) > 0) {
                $lines = [['gl' => $liabilityGl, 'type' => TransactionType::DR, 'amount' => $liabilityHeld, 'narration' => 'INVESTMENT CLOSURE']];
                $lines[] = ['gl' => $settlementGl, 'type' => TransactionType::CR, 'amount' => $cashOut, 'narration' => 'CLOSURE PROCEEDS'];
                if (bccomp($wht, '0.00', 2) > 0) {
                    $lines[] = ['gl' => $whtGl, 'type' => TransactionType::CR, 'amount' => $wht, 'narration' => 'WHT ON INVESTMENT INTEREST'];
                }
                $journal = $this->ledger->postJournal(
                    entryType: JournalEntryType::INVESTMENT_WITHDRAWAL,
                    postingDate: $date,
                    narration: sprintf('Investment closed — %s', $inv->getInvestmentNumber()),
                    postedBy: $userId,
                    lines: $lines,
                    reference: $inv->getInvestmentNumber(),
                );
                $inv->setInterestPaidToDate(bcadd($inv->getInterestPaidToDate(), $netInterest, 2));
                $inv->setWhtWithheldToDate(bcadd($inv->getWhtWithheldToDate(), $wht, 2));
                $inv->setAccruedInterest('0.00');
                $inv->setBalance('0.00');
                $this->record($inv, InvestmentTransactionType::WITHDRAWAL, $cashOut, new \DateTimeImmutable($date), 'Closed — balance returned', $journal->getId(), $userId, $accrued ?: null, $wht ?: null, $netInterest ?: null);
            }

            $inv->setStatus(InvestmentStatus::CLOSED);
            $inv->setClosedDate(new \DateTimeImmutable($date));
            $inv->setNextPayoutDate(null);
            $inv->setUpdatedBy($userId);

            $this->em->flush();
            $this->em->commit();
            return $inv;
        } catch (\Throwable $e) {
            $this->em->rollback();
            throw $e;
        }
    }

    /**
     * Liquidate a fixed-term investment early. Accrues to $date, forfeits the
     * penalty portion of the accrued (unsettled) interest, and pays principal +
     * the net of the remaining interest. Principal is never forfeited.
     */
    public function liquidate(Investment $inv, string $date, string $settlementGlId, ?string $userId): Investment
    {
        $this->assertActive($inv);
        if (!$inv->isFixedTerm()) {
            throw new DomainException('Only a fixed-term investment is liquidated; open-ended is withdrawn/closed.');
        }
        $this->assertDate($date);
        $this->periodGuard->assertDateOpen($date);

        $settlementGl = $this->settlementGl($settlementGlId);
        $liabilityGl  = $this->role(GlMappingRegistry::INVESTMENT_LIABILITY);
        $expenseGl    = $this->role(GlMappingRegistry::INVESTMENT_INTEREST_EXPENSE);
        $whtGl        = $this->role(GlMappingRegistry::WHT_PAYABLE);

        $this->em->beginTransaction();
        try {
            // Interest is earned to the actual liquidation date (whole periods +
            // the part period); the penalty below is then applied to it. Without
            // the part period the investor would be penalised twice — once by
            // losing the stub, once by the penalty.
            $this->accrueToDate($inv, $date, $settlementGlId, $userId);

            $principal = $inv->getBalance();
            // Only accrued-but-unsettled interest is penalised (compounded/periodic
            // interest already credited stays with the investor).
            $accrued = $inv->getAccruedInterest();
            $penalty = bccomp($accrued, '0.00', 2) > 0
                ? $this->money(bcmul($accrued, $inv->getEarlyLiquidationPenaltyRate(), 10))
                : '0.00';
            $payableInterest = bcsub($accrued, $penalty, 2);
            [$wht, $netInterest] = $this->splitWht($payableInterest, $inv->getWhtRate());

            // Liability currently holds principal + gross accrued (at-maturity mode)
            // or just principal (periodic/compounded, accrued already 0).
            $liabilityHeld = bcadd($principal, $accrued, 2);
            $cashOut = bcadd($principal, $netInterest, 2);

            $lines = [['gl' => $liabilityGl, 'type' => TransactionType::DR, 'amount' => $liabilityHeld, 'narration' => 'INVESTMENT LIQUIDATION']];
            $lines[] = ['gl' => $settlementGl, 'type' => TransactionType::CR, 'amount' => $cashOut, 'narration' => 'LIQUIDATION PROCEEDS (NET)'];
            if (bccomp($wht, '0.00', 2) > 0) {
                $lines[] = ['gl' => $whtGl, 'type' => TransactionType::CR, 'amount' => $wht, 'narration' => 'WHT ON INVESTMENT INTEREST'];
            }
            if (bccomp($penalty, '0.00', 2) > 0) {
                // Forfeited interest reverses the over-accrued expense.
                $lines[] = ['gl' => $expenseGl, 'type' => TransactionType::CR, 'amount' => $penalty, 'narration' => 'FORFEITED INTEREST (EARLY LIQUIDATION)'];
            }

            $journal = $this->ledger->postJournal(
                entryType: JournalEntryType::INVESTMENT_PAYOUT,
                postingDate: $date,
                narration: sprintf('Investment early liquidation — %s', $inv->getInvestmentNumber()),
                postedBy: $userId,
                lines: $lines,
                reference: $inv->getInvestmentNumber(),
            );

            if (bccomp($penalty, '0.00', 2) > 0) {
                $this->record($inv, InvestmentTransactionType::PENALTY, $penalty, new \DateTimeImmutable($date), 'Early liquidation penalty (forfeited interest)', $journal->getId(), $userId);
            }
            $inv->setInterestPaidToDate(bcadd($inv->getInterestPaidToDate(), $netInterest, 2));
            $inv->setWhtWithheldToDate(bcadd($inv->getWhtWithheldToDate(), $wht, 2));
            $inv->setAccruedInterest('0.00');
            $inv->setBalance('0.00');
            $inv->setStatus(InvestmentStatus::LIQUIDATED);
            $inv->setClosedDate(new \DateTimeImmutable($date));
            $inv->setNextPayoutDate(null);
            $this->record($inv, InvestmentTransactionType::LIQUIDATION, $cashOut, new \DateTimeImmutable($date), 'Liquidated early — principal + net interest', $journal->getId(), $userId, $payableInterest, $wht, $netInterest);
            $inv->setUpdatedBy($userId);

            $this->em->flush();
            $this->em->commit();
            return $inv;
        } catch (\Throwable $e) {
            $this->em->rollback();
            throw $e;
        }
    }

    /**
     * Settle every fixed-term investment that has reached maturity on or before
     * $asOf — the scheduled maturity sweep.
     *
     * An investment flagged auto-rollover is matured and then IMMEDIATELY
     * re-placed for its net proceeds on the same product and tenor. Booking it
     * as settle-then-place (rather than a synthetic liability-to-liability
     * transfer) keeps both journals individually balanced and leaves an
     * explicit audit trail — the investor was paid out, then reinvested — with
     * a net-zero effect on the settlement account. The new investment records
     * rolled_from_id so the chain is traceable.
     *
     * Each investment is settled independently: one failure does not abort the
     * others (unlike the interest run, where a partial batch would be a
     * reconciliation problem — here each maturity is a self-contained event).
     *
     * @return array{as_of:string, matured:int, rolled_over:int, failed:int, paid_out:string, lines:array<int,array<string,mixed>>}
     */
    public function processMaturities(string $asOf, ?string $userId, ?string $settlementGlId = null): array
    {
        $this->assertDate($asOf);
        $settlementGlId ??= $this->role(GlMappingRegistry::INVESTMENT_SETTLEMENT)->getId();

        $due = $this->investmentRepo->findMaturing(new \DateTimeImmutable($asOf));

        $matured = 0; $rolled = 0; $failed = 0; $paidOut = '0.00';
        $lines = [];

        foreach ($due as $inv) {
            $number = $inv->getInvestmentNumber();
            $wantsRollover = $inv->isAutoRollover();
            $product = $inv->getProduct();
            $tenor = $inv->getTenorDays();
            $customerId = $inv->getCustomer()->getId();
            $maturityDate = $inv->getMaturityDate()?->format('Y-m-d') ?? $asOf;

            try {
                $this->mature($inv, $settlementGlId, $userId, $maturityDate);
                $matured++;
                // Proceeds actually paid = the maturity movement's cash leg.
                $proceeds = $inv->getPrincipal();
                $line = [
                    'investment_id'     => $inv->getId(),
                    'investment_number' => $number,
                    'customer_name'     => $inv->getCustomer()->getFullName(),
                    'maturity_date'     => $maturityDate,
                    'rolled_over'       => false,
                    'new_investment'    => null,
                ];

                if ($wantsRollover && $product->isActive() && $tenor !== null) {
                    // Re-place the net proceeds: principal + interest the
                    // investor actually received on this investment.
                    $reinvest = bcadd($inv->getPrincipal(), $inv->getInterestPaidToDate(), 2);
                    try {
                        $new = $this->place(
                            $product, $customerId, $reinvest, $tenor, $maturityDate,
                            $settlementGlId, $userId, true, $inv->getPayoutDepositAccountId(), $inv->getId(),
                        );
                        $inv->setStatus(InvestmentStatus::ROLLED_OVER);
                        $this->em->flush();
                        $rolled++;
                        $line['rolled_over'] = true;
                        $line['new_investment'] = $new->getInvestmentNumber();
                        $line['reinvested'] = $reinvest;
                    } catch (\Throwable $e) {
                        // The maturity itself succeeded and the investor has
                        // been paid — only the re-placement failed. Report it
                        // rather than unwinding a correct settlement.
                        $line['rollover_error'] = $e->getMessage();
                        $failed++;
                    }
                } else {
                    $paidOut = bcadd($paidOut, $proceeds, 2);
                }

                $lines[] = $line;
            } catch (\Throwable $e) {
                $failed++;
                $lines[] = [
                    'investment_number' => $number,
                    'maturity_date'     => $maturityDate,
                    'error'             => $e->getMessage(),
                ];
                $this->logger?->error('Investment maturity failed', ['investment' => $number, 'error' => $e->getMessage()]);
            }
        }

        return [
            'as_of'       => $asOf,
            'due'         => count($due),
            'matured'     => $matured,
            'rolled_over' => $rolled,
            'failed'      => $failed,
            'paid_out'    => $paidOut,
            'lines'       => $lines,
        ];
    }

    // ── Performance (read-only) ───────────────────────────────────────────────

    /**
     * Investor performance snapshot.
     *
     * Fixed-term: projections assume the investment runs to maturity at its
     * locked rate, so the investor sees a guaranteed maturity value.
     *
     * Open-ended: there is no maturity to project to, so instead we report what
     * is meaningful for a running investment — days invested, earnings to date,
     * and an indicative next-12-months figure at the current balance and rate
     * (indicative only: the balance moves with top-ups and withdrawals).
     *
     * @return array<string, mixed>
     */
    public function performance(Investment $inv): array
    {
        $rate = $inv->getInterestRate();
        $basis = $inv->getDayCountBasis();
        $today = new \DateTimeImmutable('today');

        $projectedGross = null; $projectedNet = null; $projectedValue = null; $daysToMaturity = null;
        $indicativeAnnualGross = null; $indicativeAnnualNet = null;

        if ($inv->isFixedTerm() && $inv->getTenorDays() !== null) {
            // Full-term interest on principal at the locked rate.
            $projectedGross = $this->interest($inv->getPrincipal(), $rate, $inv->getTenorDays(), $basis);
            [$pWht, $pNet] = $this->splitWht($projectedGross, $inv->getWhtRate());
            $projectedNet = $pNet;
            $projectedValue = bcadd($inv->getPrincipal(), $pNet, 2);
            if ($inv->getMaturityDate() !== null && $inv->isActive()) {
                $daysToMaturity = max(0, $this->days($today, $inv->getMaturityDate()));
            }
        } else {
            // Open-ended — indicative 12-month earnings at the current balance.
            $indicativeAnnualGross = $this->interest($inv->getBalance(), $rate, $basis, $basis);
            [$iWht, $iNet] = $this->splitWht($indicativeAnnualGross, $inv->getWhtRate());
            $indicativeAnnualNet = $iNet;
        }

        // How long the money has actually been invested (to today, or to close).
        $endRef = $inv->getClosedDate() ?? $today;
        $daysInvested = max(0, $this->days($inv->getPlacementDate(), $endRef));

        return [
            'investment_number'       => $inv->getInvestmentNumber(),
            'type'                    => $inv->getType()->value,
            'status'                  => $inv->getStatus()->value,
            'principal'               => $inv->getPrincipal(),
            'balance'                 => $inv->getBalance(),
            'accrued_interest'        => $inv->getAccruedInterest(),
            'current_value'           => $inv->currentValue(),
            'interest_rate'           => $rate,
            'annual_rate_pct'         => bcmul($rate, '100', 4),
            'interest_earned_to_date' => $inv->getInterestEarnedToDate(),
            'interest_paid_to_date'   => $inv->getInterestPaidToDate(),
            'wht_withheld_to_date'    => $inv->getWhtWithheldToDate(),
            'placement_date'          => $inv->getPlacementDate()->format('Y-m-d'),
            'maturity_date'           => $inv->getMaturityDate()?->format('Y-m-d'),
            'days_invested'           => $daysInvested,
            // Fixed-term only — null for open-ended (no maturity to project to).
            'days_to_maturity'        => $daysToMaturity,
            'projected_gross_interest'=> $projectedGross,
            'projected_net_interest'  => $projectedNet,
            'projected_maturity_value'=> $projectedValue,
            // Open-ended only — indicative next-12-months at the current balance.
            'indicative_annual_gross' => $indicativeAnnualGross,
            'indicative_annual_net'   => $indicativeAnnualNet,
        ];
    }

    // ── Internals ─────────────────────────────────────────────────────────────

    /** interest = amount × rate × days ÷ basis, rounded to 2dp. */
    private function interest(string $amount, string $rate, int $days, int $basis): string
    {
        $v = bcmul(bcmul($amount, $rate, 12), (string) $days, 12);
        $v = bcdiv($v, (string) $basis, 12);
        return $this->money($v);
    }

    /** @return array{0:string,1:string} [wht, net] */
    private function splitWht(string $gross, string $whtRate): array
    {
        $wht = $this->money(bcmul($gross, $whtRate, 12));
        $net = bcsub($gross, $wht, 2);
        return [$wht, $net];
    }

    /** First period boundary after placement, capped at maturity for fixed. */
    private function firstPeriodEnd(Investment $inv): \DateTimeImmutable
    {
        $end = $inv->getPayoutFrequency()->advance($inv->getPlacementDate());
        if ($inv->isFixedTerm() && $inv->getMaturityDate() !== null && $end > $inv->getMaturityDate()) {
            return $inv->getMaturityDate();
        }
        return $end;
    }

    /** Next boundary after $from, capped at maturity for fixed-term. */
    private function advance(Investment $inv, \DateTimeImmutable $from): ?\DateTimeImmutable
    {
        if ($inv->isFixedTerm() && $inv->getMaturityDate() !== null) {
            if ($from >= $inv->getMaturityDate()) {
                return null; // no periods past maturity
            }
            $next = $inv->getPayoutFrequency()->advance($from);
            return $next > $inv->getMaturityDate() ? $inv->getMaturityDate() : $next;
        }
        return $inv->getPayoutFrequency()->advance($from);
    }

    private function days(\DateTimeImmutable $a, \DateTimeImmutable $b): int
    {
        return (int) $a->diff($b)->format('%r%a');
    }

    private function role(string $roleKey): GeneralLedger
    {
        return $this->glMapping->resolveOrFail($roleKey);
    }

    private function settlementGl(string $glId): GeneralLedger
    {
        $gl = $this->glRepo->find($glId);
        if ($gl === null) {
            throw new DomainException('Settlement GL account not found.');
        }
        if (!$gl->isActive()) {
            throw new DomainException('Settlement GL account is inactive.');
        }
        return $gl;
    }

    private function record(
        Investment $inv,
        InvestmentTransactionType $type,
        string $amount,
        \DateTimeImmutable $valueDate,
        string $narration,
        ?string $journalId,
        ?string $userId,
        ?string $gross = null,
        ?string $wht = null,
        ?string $net = null,
    ): InvestmentTransaction {
        $txn = new InvestmentTransaction();
        $txn->setInvestment($inv);
        $txn->setType($type);
        $txn->setAmount($amount);
        $txn->setGrossInterest($gross);
        $txn->setWhtAmount($wht);
        $txn->setNetInterest($net);
        $txn->setBalanceAfter($inv->getBalance());
        $txn->setValueDate($valueDate);
        $txn->setNarration($narration);
        $txn->setReference($inv->getInvestmentNumber());
        $txn->setJournalEntryId($journalId);
        $txn->setCreatedBy($userId);
        $this->em->persist($txn);
        return $txn;
    }

    private function assertActive(Investment $inv): void
    {
        if (!$inv->isActive()) {
            throw new DomainException(sprintf('Investment %s is %s and cannot be transacted.', $inv->getInvestmentNumber(), $inv->getStatus()->value));
        }
    }

    private function assertDate(string $d): void
    {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) {
            throw new DomainException('Date must be YYYY-MM-DD.');
        }
    }

    private function money(string $v): string
    {
        // Round half up at 2dp. All investment magnitudes are non-negative.
        if (bccomp($v, '0', 12) < 0) {
            return bcsub($v, '0.005', 2);
        }
        return bcadd($v, '0.005', 2);
    }

    private function uniqueNumber(): string
    {
        for ($i = 0; $i < 12; $i++) {
            $n = Investment::generateNumber();
            if (!$this->investmentRepo->numberExists($n)) {
                return $n;
            }
        }
        throw new DomainException('Could not allocate a unique investment number.');
    }
}
