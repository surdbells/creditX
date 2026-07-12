<?php
declare(strict_types=1);
namespace App\Domain\Enum;

/**
 * Lifecycle of a loan settlement (the actual outbound bank transfer that
 * pays the disbursed funds to the customer via Paystack/Flutterwave).
 *
 *   PENDING    → record created, not yet submitted to the provider.
 *   PROCESSING → submitted to the provider, awaiting the async webhook.
 *   SUCCESS    → provider confirmed the funds reached the customer.
 *   FAILED     → provider rejected/failed the transfer (retryable).
 *   REVERSED   → funds were returned/reversed after an initial success.
 */
enum SettlementStatus: string
{
    case PENDING    = 'pending';
    case PROCESSING = 'processing';
    case SUCCESS    = 'success';
    case FAILED     = 'failed';
    case REVERSED   = 'reversed';

    /** No further automatic transitions expected. */
    public function isTerminal(): bool
    {
        return in_array($this, [self::SUCCESS, self::FAILED, self::REVERSED], true);
    }

    /**
     * An "active" settlement occupies the loan and blocks a duplicate
     * payout. FAILED/REVERSED are NOT active — they can be retried.
     */
    public function isActive(): bool
    {
        return in_array($this, [self::PENDING, self::PROCESSING, self::SUCCESS], true);
    }
}
