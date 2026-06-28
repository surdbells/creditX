<?php
declare(strict_types=1);
namespace App\Domain\Enum;

/**
 * High-level classification for journal entries. Mirrors the trans_callback
 * prefix convention used today (DISB-, REPAY-, PEN-, WO-, PROV-, CLOSE-, REV-)
 * but encoded in a typed enum on the JournalEntry header.
 *
 * Why this exists:
 *   - Filter and group the Journal Entries page by category (e.g. "show me
 *     all PROVISION entries this month") without parsing strings
 *   - Reporting joins (e.g. activity by entry type, anomaly detection)
 *   - Audit trail: an auditor can quickly identify which kind of business
 *     event produced a given GL movement
 *
 * One-time chance to encode this cleanly. Deferring it would mean a follow-up
 * migration after deployment.
 *
 * Fees are intentionally NOT a separate type — fees are DR/CR lines within
 * a DISBURSEMENT or REPAYMENT journal, not a journal of their own. Splitting
 * them across types would fragment a single semantic journal.
 *
 * MANUAL is included for forward compat: CreditX has no manual journal
 * entry creation flow today, but we expect to add one. Adding the case
 * now avoids another migration when we do.
 */
enum JournalEntryType: string
{
    case DISBURSEMENT = 'DISBURSEMENT';
    case REPAYMENT    = 'REPAYMENT';
    case PENALTY      = 'PENALTY';
    case WRITE_OFF    = 'WRITE_OFF';
    case PROVISION    = 'PROVISION';
    case CLOSE        = 'CLOSE';
    case REVERSAL     = 'REVERSAL';
    case MANUAL       = 'MANUAL';
    case INTEREST_ACCRUAL = 'INTEREST_ACCRUAL';
}
