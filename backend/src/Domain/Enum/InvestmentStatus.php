<?php
declare(strict_types=1);
namespace App\Domain\Enum;

/**
 * Lifecycle state of an investment.
 *
 *   ACTIVE      — placed and earning. Open-ended stays here for life; fixed
 *                 stays here until maturity.
 *   MATURED     — a fixed-term investment reached maturity and was settled
 *                 (principal + interest paid, or rolled over). Terminal.
 *   LIQUIDATED  — closed early by the investor before maturity (with penalty).
 *                 Terminal.
 *   CLOSED      — open-ended investment fully withdrawn and closed. Terminal.
 *   ROLLED_OVER — matured and its proceeds were rolled into a new investment;
 *                 kept for the audit trail. Terminal.
 */
enum InvestmentStatus: string
{
    case ACTIVE      = 'active';
    case MATURED     = 'matured';
    case LIQUIDATED  = 'liquidated';
    case CLOSED      = 'closed';
    case ROLLED_OVER = 'rolled_over';

    public function isTerminal(): bool
    {
        return $this !== self::ACTIVE;
    }
}
