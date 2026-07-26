<?php
declare(strict_types=1);
namespace App\Domain\Enum;

/**
 * Whether an investment has a fixed maturity or runs open-endedly.
 *
 *   FIXED_TERM  — principal is locked for a set tenor at a rate fixed at
 *                 placement; it has a maturity date. Early exit carries a
 *                 liquidation penalty. Interest payout follows the product's
 *                 payout mode (at maturity / periodic / compounded).
 *   OPEN_ENDED  — no maturity. The investor can top up and withdraw; interest
 *                 accrues on the running balance at the prevailing rate and
 *                 compounds. Performance is the running balance + earnings.
 */
enum InvestmentType: string
{
    case FIXED_TERM = 'fixed_term';
    case OPEN_ENDED = 'open_ended';
}
