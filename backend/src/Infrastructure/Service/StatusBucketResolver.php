<?php

declare(strict_types=1);

namespace App\Infrastructure\Service;

/**
 * Friendly-bucket → raw loan status mapping for the performance reports.
 *
 * The performance reports expose a simplified status filter to end users
 * ("Pending", "Approved", "Disbursed", "Performing", "Non-Performing",
 * "Closed", "Rejected") rather than the 8 raw loan statuses. This
 * resolver expands a bucket slug to the array of raw statuses the
 * service-layer SQL needs.
 *
 * Bucket mapping (locked in the Phase 2.2 plan):
 *
 *   pending         => captured, submitted
 *   approved        => approved
 *   disbursed       => disbursed              (S1: narrow)
 *   performing      => active
 *   non_performing  => overdue
 *   closed          => closed
 *   rejected        => rejected
 *
 * "All" is represented by a null/empty/missing status parameter — the
 * resolver returns null in that case, and the service layer interprets
 * null as "no status filter."
 */
final class StatusBucketResolver
{
    private const BUCKETS = [
        'pending'        => ['captured', 'submitted'],
        'approved'       => ['approved'],
        'disbursed'      => ['disbursed'],
        'performing'     => ['active'],
        'non_performing' => ['overdue'],
        'closed'         => ['closed'],
        'rejected'       => ['rejected'],
    ];

    /**
     * Expand a bucket slug (e.g. 'pending') to an array of raw statuses.
     * Returns null when the input is empty, 'all', or unrecognised — the
     * service layer treats null as "no status filter".
     *
     * @return string[]|null
     */
    public static function expand(?string $bucket): ?array
    {
        if ($bucket === null) return null;
        $bucket = strtolower(trim($bucket));
        if ($bucket === '' || $bucket === 'all') return null;
        if (isset(self::BUCKETS[$bucket])) return self::BUCKETS[$bucket];
        // Passthrough: also accept a raw loan status directly (e.g. 'active',
        // 'under_review', 'cancelled') so reports can filter by any specific
        // status, not just the friendly buckets.
        if (\App\Domain\Enum\LoanStatus::tryFrom($bucket) !== null) return [$bucket];
        return null;
    }

    /**
     * @return array<string, string[]>  Map of bucket slug => raw statuses.
     *                                  Useful for UI to enumerate options.
     */
    public static function all(): array
    {
        return self::BUCKETS;
    }
}
