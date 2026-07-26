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
            $tenorDays = null;
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
            $inv->setPayoutMode($isFixed ? $product->getPayoutMode() : InvestmentPayoutMode::COMPOUNDED);
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
            // Recognise interest up to the top-up date first, so the new money
            // doesn't earn interest for the period before it arrived.
            $this->accrueThrough($inv, $date, $settlementGlId, $userId, /* inner */ true);

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
            $this->accrueThrough($inv, $date, $settlementGlId, $userId, true);

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

            $gross = $this->interest($inv->getBalance(), $inv->getInterestRate(), $days, $inv->getDayCountBasis());
            $date  = $end->format('Y-m-d');

            if (bccomp($gross, self::MIN_POSTABLE, 2) >= 0) {
                switch ($inv->getPayoutMode()) {
                    case InvestmentPayoutMode::AT_MATURITY:
                        // Build the liability; settle (with WHT) at maturity.
                        $journal = $this->ledger->postJournal(
                            entryType: JournalEntryType::INVESTMENT_INTEREST,
                            postingDate: $date,
                            narration: sprintf('Investment interest accrual — %s', $inv->getInvestmentNumber()),
                            postedBy: $userId,
                            lines: [
                                ['gl' => $expenseGl,   'type' => TransactionType::DR, 'amount' => $gross, 'narration' => 'INVESTMENT INTEREST ACCRUAL'],
                                ['gl' => $liabilityGl, 'type' => TransactionType::CR, 'amount' => $gross, 'narration' => 'INVESTMENT INTEREST ACCRUED'],
                            ],
                            reference: $inv->getInvestmentNumber(),
                        );
                        $inv->setAccruedInterest(bcadd($inv->getAccruedInterest(), $gross, 2));
                        $inv->setInterestEarnedToDate(bcadd($inv->getInterestEarnedToDate(), $gross, 2));
                        $this->record($inv, InvestmentTransactionType::ACCRUAL, $gross, $end, 'Interest accrued', $journal->getId(), $userId, $gross, '0.00', $gross);
                        $sumGross = bcadd($sumGross, $gross, 2);
                        break;

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
                            narration: sprintf('Investment interest payout — %s', $inv->getInvestmentNumber()),
                            postedBy: $userId,
                            lines: $lines,
                            reference: $inv->getInvestmentNumber(),
                        );
                        $inv->setInterestEarnedToDate(bcadd($inv->getInterestEarnedToDate(), $gross, 2));
                        $inv->setInterestPaidToDate(bcadd($inv->getInterestPaidToDate(), $net, 2));
                        $inv->setWhtWithheldToDate(bcadd($inv->getWhtWithheldToDate(), $wht, 2));
                        $this->record($inv, InvestmentTransactionType::PAYOUT, $gross, $end, 'Interest paid out', $journal->getId(), $userId, $gross, $wht, $net);
                        $sumGross = bcadd($sumGross, $gross, 2); $sumWht = bcadd($sumWht, $wht, 2); $sumNet = bcadd($sumNet, $net, 2);
                        break;

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
                            narration: sprintf('Investment interest capitalised — %s', $inv->getInvestmentNumber()),
                            postedBy: $userId,
                            lines: $lines,
                            reference: $inv->getInvestmentNumber(),
                        );
                        $inv->setBalance(bcadd($inv->getBalance(), $net, 2));
                        $inv->setInterestEarnedToDate(bcadd($inv->getInterestEarnedToDate(), $gross, 2));
                        $inv->setInterestPaidToDate(bcadd($inv->getInterestPaidToDate(), $net, 2));
                        $inv->setWhtWithheldToDate(bcadd($inv->getWhtWithheldToDate(), $wht, 2));
                        $this->record($inv, InvestmentTransactionType::CAPITALISATION, $gross, $end, 'Interest capitalised', $journal->getId(), $userId, $gross, $wht, $net);
                        $sumGross = bcadd($sumGross, $gross, 2); $sumWht = bcadd($sumWht, $wht, 2); $sumNet = bcadd($sumNet, $net, 2);
                        break;
                }
                $periods++;
            }

            $inv->setLastAccrualDate($end);
            $inv->setNextPayoutDate($this->advance($inv, $end));
        }

        $inv->setUpdatedBy($userId);
        return ['periods' => $periods, 'gross' => $sumGross, 'wht' => $sumWht, 'net' => $sumNet];
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
            // Accrue any whole periods up to the liquidation date.
            $this->accrueThrough($inv, $date, $settlementGlId, $userId, true);

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

    // ── Performance (read-only) ───────────────────────────────────────────────

    /**
     * Investor performance snapshot. Projected figures assume the investment
     * runs to maturity at its locked rate (fixed-term).
     *
     * @return array<string, mixed>
     */
    public function performance(Investment $inv): array
    {
        $rate = $inv->getInterestRate();
        $basis = $inv->getDayCountBasis();

        $projectedGross = null; $projectedNet = null; $projectedValue = null; $daysToMaturity = null;
        if ($inv->isFixedTerm() && $inv->getTenorDays() !== null) {
            // Full-term interest on principal at the locked rate.
            $projectedGross = $this->interest($inv->getPrincipal(), $rate, $inv->getTenorDays(), $basis);
            [$pWht, $pNet] = $this->splitWht($projectedGross, $inv->getWhtRate());
            $projectedNet = $pNet;
            $projectedValue = bcadd($inv->getPrincipal(), $pNet, 2);
            if ($inv->getMaturityDate() !== null && $inv->isActive()) {
                $daysToMaturity = max(0, $this->days(new \DateTimeImmutable('today'), $inv->getMaturityDate()));
            }
        }

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
            'days_to_maturity'        => $daysToMaturity,
            'projected_gross_interest'=> $projectedGross,
            'projected_net_interest'  => $projectedNet,
            'projected_maturity_value'=> $projectedValue,
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
