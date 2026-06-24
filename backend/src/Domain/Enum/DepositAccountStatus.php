<?php
declare(strict_types=1);
namespace App\Domain\Enum;

/**
 * Lifecycle state of an individual deposit account.
 *
 *   ACTIVE  — open and transactable.
 *   DORMANT — no customer-initiated activity for the product's dormancy
 *             window; transactions are blocked until reactivated. (CBN
 *             rules require dormant accounts to be flagged and frozen.)
 *   FROZEN  — administratively held (e.g. court order, fraud review);
 *             no deposits or withdrawals permitted.
 *   CLOSED  — terminated; balance settled to zero. Terminal state.
 */
enum DepositAccountStatus: string
{
    case ACTIVE  = 'active';
    case DORMANT = 'dormant';
    case FROZEN  = 'frozen';
    case CLOSED  = 'closed';
}
