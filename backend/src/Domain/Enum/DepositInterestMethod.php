<?php
declare(strict_types=1);
namespace App\Domain\Enum;

/**
 * Per-product configuration for how a deposit product accrues interest.
 *
 *   NONE                 — current/transactional account; pays no interest.
 *   MIN_BALANCE_MONTHLY  — savings; interest computed monthly on the
 *                          LOWEST balance the account held during the
 *                          period (the classic "minimum monthly balance"
 *                          method that discourages mid-month withdrawals).
 *   DAILY_BALANCE_MONTHLY— interest computed on the average daily balance
 *                          over the period, then posted monthly (rewards
 *                          customers who keep funds in for part of a month).
 *
 * The annual rate lives on DepositProduct.interestRate; the method here
 * only decides the balance basis. Interest is posted monthly in all
 * non-NONE cases (DR Interest Expense, CR Customer Deposits).
 */
enum DepositInterestMethod: string
{
    case NONE                  = 'none';
    case MIN_BALANCE_MONTHLY   = 'min_balance_monthly';
    case DAILY_BALANCE_MONTHLY = 'daily_balance_monthly';
}
