<?php

declare(strict_types=1);

namespace App\Infrastructure\Service;

use App\Domain\Entity\DepositAccount;
use App\Domain\Enum\DepositInterestMethod;
use App\Domain\Enum\DepositTransactionType;
use App\Domain\Exception\DomainException;
use App\Domain\Repository\DepositAccountRepository;
use App\Domain\Repository\DepositTransactionRepository;
use Doctrine\ORM\EntityManagerInterface;

/**
 * DepositInterestService — the monthly interest accrual run for deposit
 * accounts. The balance basis is chosen per-product (DepositInterestMethod):
 *
 *   MIN_BALANCE_MONTHLY    interest = minBalance × (annualRate / 12)
 *                          minBalance = lowest running balance held during
 *                          the period (classic "minimum monthly balance").
 *
 *   DAILY_BALANCE_MONTHLY  interest = avgDailyBalance × annualRate × days/365
 *                          avgDailyBalance = Σ(balance_day) / daysInPeriod,
 *                          integrated over the running balance.
 *
 * Each non-trivial accrual posts one INTEREST movement via
 * DepositService::postMovement (DR Interest Expense, CR Customer Deposits),
 * so the GL and the deposit sub-ledger stay in step.
 *
 * preview() runs the same computation read-only and returns what WOULD be
 * posted, so an accountant can review before committing the run.
 */
final class DepositInterestService
{
    /** Don't bother posting accruals below one kobo. */
    private const MIN_POSTABLE = '0.01';

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly DepositAccountRepository $accountRepo,
        private readonly DepositTransactionRepository $txnRepo,
        private readonly DepositService $deposits,
        private readonly PeriodGuardService $periodGuard,
    ) {}

    /**
     * Preview the accrual for a period without posting.
     *
     * @return array<int, array<string, string>>
     */
    public function preview(string $period): array
    {
        [$start, $end] = $this->resolvePeriod($period);
        $results = [];
        foreach ($this->accountRepo->findInterestBearingActive() as $account) {
            $interest = $this->computeInterest($account, $start, $end);
            if (bccomp($interest, self::MIN_POSTABLE, 2) < 0) {
                continue;
            }
            $results[] = [
                'account_number' => $account->getAccountNumber(),
                'customer_name'  => $account->getCustomer()->getFullName(),
                'product_code'   => $account->getProduct()->getCode(),
                'method'         => $account->getProduct()->getInterestMethod()->value,
                'current_balance'=> $account->getBalance(),
                'interest'       => $interest,
            ];
        }
        return $results;
    }

    /**
     * Run the accrual for a period and post the interest. Each account's
     * posting is wrapped by DepositService::postMovement's own transaction
     * (via deposit()-style wrapping below), so one failing account doesn't
     * roll back the whole run.
     *
     * @return array{period: string, posting_date: string, accounts_credited: int, total_interest: string, lines: array<int, array<string, string>>}
     */
    public function run(string $period, ?string $userId): array
    {
        [$start, $end] = $this->resolvePeriod($period);
        $postingDate = $end; // post interest on the last day of the period
        $this->periodGuard->assertDateOpen($postingDate);

        $lines = [];
        $total = '0.00';
        $count = 0;

        foreach ($this->accountRepo->findInterestBearingActive() as $account) {
            $interest = $this->computeInterest($account, $start, $end);
            if (bccomp($interest, self::MIN_POSTABLE, 2) < 0) {
                continue;
            }

            $this->em->beginTransaction();
            try {
                $this->deposits->postMovement(
                    $account,
                    DepositTransactionType::INTEREST,
                    $interest,
                    $postingDate,
                    sprintf('Interest for %s', $period),
                    'INT-' . str_replace('-', '', $period),
                    $userId,
                );
                $this->em->commit();
            } catch (\Throwable $e) {
                $this->em->rollback();
                throw $e;
            }

            $lines[] = [
                'account_number' => $account->getAccountNumber(),
                'interest'       => $interest,
            ];
            $total = bcadd($total, $interest, 2);
            $count++;
        }

        return [
            'period'            => $period,
            'posting_date'      => $postingDate,
            'accounts_credited' => $count,
            'total_interest'    => $total,
            'lines'             => $lines,
        ];
    }

    /**
     * Compute the interest accrual for one account over [$start, $end]
     * (inclusive dates, YYYY-MM-DD) using its product's method.
     */
    private function computeInterest(DepositAccount $account, string $start, string $end): string
    {
        $product = $account->getProduct();
        $method  = $product->getInterestMethod();
        $rate    = $product->getInterestRate(); // annual, decimal

        if ($method === DepositInterestMethod::NONE || bccomp($rate, '0', 6) <= 0) {
            return '0.00';
        }

        $opening = $this->txnRepo->balanceBefore($account->getId(), $start) ?? '0.00';
        $txns    = $this->txnRepo->inPeriod($account->getId(), $start, $end);

        if ($method === DepositInterestMethod::MIN_BALANCE_MONTHLY) {
            $min = $opening;
            foreach ($txns as $t) {
                if (bccomp($t->getBalanceAfter(), $min, 2) < 0) {
                    $min = $t->getBalanceAfter();
                }
            }
            if (bccomp($min, '0.00', 2) <= 0) {
                return '0.00';
            }
            // monthly rate = annual / 12
            $monthlyRate = bcdiv($rate, '12', 12);
            return $this->round2(bcmul($min, $monthlyRate, 12));
        }

        // DAILY_BALANCE_MONTHLY: integrate the running balance day-by-day.
        $startDt = new \DateTimeImmutable($start);
        $endDt   = new \DateTimeImmutable($end);
        $daysInPeriod = (int) $endDt->diff($startDt)->days + 1; // inclusive

        // Build (date => end-of-day balance) by walking transactions; days
        // with no transaction inherit the prior day's balance.
        $balanceByDay = [];
        $running = $opening;
        $txnByDay = [];
        foreach ($txns as $t) {
            // last balanceAfter on a given day wins
            $txnByDay[$t->getPostingDate()->format('Y-m-d')] = $t->getBalanceAfter();
        }
        $cursor = $startDt;
        $sumBalances = '0.00';
        for ($i = 0; $i < $daysInPeriod; $i++) {
            $key = $cursor->format('Y-m-d');
            if (isset($txnByDay[$key])) {
                $running = $txnByDay[$key];
            }
            $sumBalances = bcadd($sumBalances, $running, 2);
            $cursor = $cursor->modify('+1 day');
        }

        if (bccomp($sumBalances, '0.00', 2) <= 0) {
            return '0.00';
        }
        $avgDaily = bcdiv($sumBalances, (string) $daysInPeriod, 12);
        // interest = avg × annualRate × daysInPeriod / 365
        $interest = bcmul($avgDaily, $rate, 12);
        $interest = bcmul($interest, (string) $daysInPeriod, 12);
        $interest = bcdiv($interest, '365', 12);
        return $this->round2($interest);
    }

    /**
     * Resolve a 'YYYY-MM' period string to its first and last calendar day.
     *
     * @return array{0: string, 1: string}
     */
    private function resolvePeriod(string $period): array
    {
        if (!preg_match('/^\d{4}-\d{2}$/', $period)) {
            throw new DomainException("period must be in YYYY-MM format (got '{$period}').");
        }
        $start = new \DateTimeImmutable($period . '-01');
        $end   = $start->modify('last day of this month');
        return [$start->format('Y-m-d'), $end->format('Y-m-d')];
    }

    /** Round a high-precision BCMath string to 2 dp (half-up). */
    private function round2(string $value): string
    {
        $add = str_starts_with($value, '-') ? '-0.005' : '0.005';
        return bcadd($value, $add, 2);
    }
}
