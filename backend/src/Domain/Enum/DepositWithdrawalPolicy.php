<?php
declare(strict_types=1);
namespace App\Domain\Enum;

/**
 * Per-product configuration for what a withdrawal is allowed to do to the
 * account balance.
 *
 *   STRICT_MIN_BALANCE — block any withdrawal that would take the balance
 *                        below the product's minimum balance. The safest
 *                        policy; used for savings products that must keep
 *                        a floor (e.g. to remain interest-eligible).
 *   BLOCK_OVERDRAW     — allow the balance down to zero but never below.
 *                        No minimum-balance floor, just no overdraft.
 *   ALLOW_OVERDRAW     — permit the balance to go negative (overdraft) and
 *                        flag it. The account is allowed to carry a debit
 *                        balance; surfacing it is left to reporting.
 */
enum DepositWithdrawalPolicy: string
{
    case STRICT_MIN_BALANCE = 'strict_min_balance';
    case BLOCK_OVERDRAW     = 'block_overdraw';
    case ALLOW_OVERDRAW     = 'allow_overdraw';
}
