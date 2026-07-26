<?php
declare(strict_types=1);
namespace App\Domain\Enum;

/**
 * The cadence at which interest is compounded and/or paid out. Applies to
 * PERIODIC and COMPOUNDED payout modes; ignored for AT_MATURITY.
 */
enum InvestmentPayoutFrequency: string
{
    case MONTHLY   = 'monthly';
    case QUARTERLY = 'quarterly';
    case ANNUALLY  = 'annually';

    /** Number of periods in a year — used to split the annual rate. */
    public function periodsPerYear(): int
    {
        return match ($this) {
            self::MONTHLY   => 12,
            self::QUARTERLY => 4,
            self::ANNUALLY  => 1,
        };
    }

    /** Advance a date by one period of this frequency. */
    public function advance(\DateTimeImmutable $from): \DateTimeImmutable
    {
        return match ($this) {
            self::MONTHLY   => $from->modify('+1 month'),
            self::QUARTERLY => $from->modify('+3 months'),
            self::ANNUALLY  => $from->modify('+1 year'),
        };
    }
}
