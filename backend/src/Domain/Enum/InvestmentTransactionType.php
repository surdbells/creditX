<?php
declare(strict_types=1);
namespace App\Domain\Enum;

/**
 * Classifies a movement on an investment. Each maps to a balanced GL journal
 * posted via LedgerService::postJournal. "Settlement" is the operator-chosen
 * bank/cash GL (as with loan disbursement), not a fixed role.
 *
 *   PLACEMENT       principal in:        DR Settlement,           CR Investment Liability
 *   TOP_UP          add to open-ended:   DR Settlement,           CR Investment Liability
 *   ACCRUAL         interest recognised: DR Investment Int. Exp., CR Investment Liability (gross)
 *   PAYOUT          interest paid:       DR Investment Liability, CR Settlement (net) + CR WHT Payable
 *   CAPITALISATION  interest compounded: (no cash) recorded against the balance; GL already holds it
 *   WITHDRAWAL      open-ended cash out: DR Investment Liability, CR Settlement
 *   MATURITY        fixed settled:       DR Investment Liability, CR Settlement (net) + CR WHT Payable
 *   LIQUIDATION     early close:         DR Investment Liability, CR Settlement (+ penalty to income)
 *   PENALTY         early-exit charge:   DR Investment Liability, CR Penalty/Other Income
 *   WHT             tax withheld leg:    booked within PAYOUT/MATURITY (CR WHT Payable)
 *   REVERSAL        contra of a prior movement (mirrors its legs)
 */
enum InvestmentTransactionType: string
{
    case PLACEMENT      = 'placement';
    case TOP_UP         = 'top_up';
    case ACCRUAL        = 'accrual';
    case PAYOUT         = 'payout';
    case CAPITALISATION = 'capitalisation';
    case WITHDRAWAL     = 'withdrawal';
    case MATURITY       = 'maturity';
    case LIQUIDATION    = 'liquidation';
    case PENALTY        = 'penalty';
    case WHT            = 'wht';
    case REVERSAL       = 'reversal';
}
