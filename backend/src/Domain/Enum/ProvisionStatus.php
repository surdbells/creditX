<?php
declare(strict_types=1);
namespace App\Domain\Enum;

/**
 * Lifecycle of a provision run.
 *
 *   DRAFT     — preview only, nothing posted. (Reserved — current
 *               implementation posts immediately on create; draft
 *               lifecycle is for a future 'review before post'
 *               workflow.)
 *   POSTED    — journal entries are in the GL. The run's line
 *               snapshots represent the cumulative provision as of
 *               the run's as_of date.
 *   REVERSED  — the posting has been reversed via JournalReversalService.
 *               The line snapshots are preserved for audit but the
 *               GL impact has been unwound. Follow-up provision runs
 *               compute deltas against the PRIOR posted (non-reversed)
 *               run, not this one.
 */
enum ProvisionStatus: string
{
    case DRAFT = 'draft';
    case POSTED = 'posted';
    case REVERSED = 'reversed';
}
