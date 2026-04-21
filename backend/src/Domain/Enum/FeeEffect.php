<?php
declare(strict_types=1);
namespace App\Domain\Enum;

/**
 * FeeEffect — how a ProductFee impacts the loan computation.
 *
 * This is distinct from FeeAppliesTo (which chooses the BASE for the
 * percentage calculation — principal vs gross_loan). Effect says what
 * happens to the resulting amount:
 *
 *   ADDS_TO_GROSS
 *     The fee is added to app_amount when computing gross_loan. The
 *     customer repays principal + these fees over the loan term via
 *     the schedule. Interest is charged on gross_loan, which includes
 *     these fees. Typical: Admin Fee, Insurance Fee.
 *
 *   DEDUCTED_FROM_DISBURSEMENT
 *     The fee is subtracted from app_amount when computing net_disbursed
 *     (what the customer actually receives). It does NOT inflate gross_loan
 *     — the customer doesn't repay this fee through the schedule; they
 *     effectively pay it up front by receiving less than they applied for.
 *     Typical: Management Fee, Bank Statement Fee.
 *
 * Matches the semantics of the legacy CreditX loan calculator:
 *
 *   $gross_loan    = $app_amount + $admin_fee + $insurance_fee;
 *   $net_disbursed = $app_amount - $mgt_fee - $bs_fee - $old_loan_balance;
 *
 * Admin + Insurance are ADDS_TO_GROSS; Management + BS are DEDUCTED_FROM_DISBURSEMENT.
 */
enum FeeEffect: string
{
    case ADDS_TO_GROSS = 'adds_to_gross';
    case DEDUCTED_FROM_DISBURSEMENT = 'deducted_from_disbursement';
}
