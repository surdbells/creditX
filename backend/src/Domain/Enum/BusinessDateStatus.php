<?php
declare(strict_types=1);
namespace App\Domain\Enum;

/**
 * Lifecycle of a single business date in the accounting calendar.
 *
 *   FUTURE     — not yet reached. Nothing may post to it (§5: future posting
 *                is never permitted, for anyone).
 *   OPEN       — accepting postings. Normally exactly one date is OPEN — the
 *                Current Accounting Date — but a prior date may remain OPEN
 *                when EOD has not yet been run for it, which is precisely what
 *                makes controlled backdating possible.
 *   PROCESSING — End-of-Day is running against this date. Postings are locked
 *                for the duration so no entry can slip in between the trial
 *                balance check and the close (§17: prevent race conditions).
 *   CLOSED     — EOD completed. Postings are refused unless the date is
 *                explicitly reopened by an authorised user.
 *
 * Distinct from PeriodStatus, which governs the MONTHLY accounting period and
 * its close-to-retained-earnings journal. The two nest: a posting must sit on
 * an OPEN business date AND inside a month that is not closed.
 */
enum BusinessDateStatus: string
{
    case FUTURE     = 'future';
    case OPEN       = 'open';
    case PROCESSING = 'processing';
    case CLOSED     = 'closed';

    public function label(): string
    {
        return match ($this) {
            self::FUTURE     => 'Future',
            self::OPEN       => 'Open',
            self::PROCESSING => 'Processing',
            self::CLOSED     => 'Closed',
        };
    }

    /** Colour key the calendar UI renders (§12). */
    public function tone(): string
    {
        return match ($this) {
            self::OPEN       => 'green',
            self::CLOSED     => 'gray',
            self::FUTURE     => 'blue',
            self::PROCESSING => 'orange',
        };
    }

    public function acceptsPostings(): bool
    {
        return $this === self::OPEN;
    }
}
