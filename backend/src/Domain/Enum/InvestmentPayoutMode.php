<?php
declare(strict_types=1);
namespace App\Domain\Enum;

/**
 * How interest earned on an investment is settled.
 *
 *   AT_MATURITY  — interest accrues and is paid as a lump sum on the maturity
 *                  date (fixed-term only). Nothing leaves before maturity.
 *   PERIODIC     — interest is paid out to the investor each period
 *                  (see InvestmentPayoutFrequency); principal returns at
 *                  maturity (fixed) or on withdrawal (open-ended).
 *   COMPOUNDED   — interest capitalises into the balance each period and is
 *                  paid with principal at maturity (fixed) or grows the
 *                  running balance (open-ended). Open-ended investments are
 *                  always compounded.
 */
enum InvestmentPayoutMode: string
{
    case AT_MATURITY = 'at_maturity';
    case PERIODIC    = 'periodic';
    case COMPOUNDED  = 'compounded';
}
