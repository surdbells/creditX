<?php
declare(strict_types=1);
namespace App\Infrastructure\Service;

use App\Domain\Entity\AccountingPeriod;
use App\Domain\Enum\PeriodStatus;
use App\Domain\Exception\DomainException;
use Doctrine\ORM\EntityManagerInterface;

/**
 * PeriodGuardService — injected into every posting service
 * (DisbursementService, RepaymentService, LoanLifecycleService,
 * JournalReversalService, OverdueService) so they can refuse to
 * post ledger entries into a closed accounting period.
 *
 * ## Why a dedicated service
 *
 * PeriodCloseService would be a natural home, but it already depends
 * on JournalReversalService (for reopenPeriod). Injecting
 * PeriodCloseService into JournalReversalService would create a
 * circular dependency in the DI container. PeriodGuardService depends
 * on nothing but EntityManagerInterface and sidesteps the cycle.
 *
 * PeriodCloseService still has its own copies of isDateInClosedPeriod +
 * assertDateOpen — kept there for symmetry and to avoid making
 * PeriodCloseService depend on PeriodGuardService for a 6-line method.
 *
 * ## Why not a Doctrine prePersist hook on LedgerTransaction
 *
 * Doctrine lifecycle callbacks can't easily access services (they'd
 * need an EventSubscriber setup). Service-level checks at the top of
 * each posting method are simpler, give clearer error messages
 * ("Cannot disburse with effective date in closed period 2026-01"
 * vs a generic "posting rejected"), and sit at the natural
 * transaction boundary.
 *
 * ## Why cheap enough to call every post
 *
 * One indexed SELECT on (year, month) against the accounting_periods
 * table. The table typically has ~36 rows (3 years of history) so
 * the index is trivial. Service methods call this once at the top
 * of each transaction — every entry in the same transaction shares
 * the same effective date, so one check per transaction suffices.
 */
final class PeriodGuardService
{
    public function __construct(
        private readonly EntityManagerInterface $em,
    ) {}

    /**
     * Returns true iff the given (year, month) has an AccountingPeriod
     * row with status = closed. Missing rows imply 'open' (the default
     * state for a month that's never been explicitly closed).
     */
    public function isDateInClosedPeriod(string $year, string $month): bool
    {
        $paddedMonth = str_pad($month, 2, '0', STR_PAD_LEFT);
        $period = $this->em->getRepository(AccountingPeriod::class)
            ->findOneBy(['year' => $year, 'month' => $paddedMonth]);
        return $period !== null && $period->getStatus() === PeriodStatus::CLOSED;
    }

    /**
     * Assert a YYYY-MM-DD date is not in a closed period. Throws
     * DomainException if it is.
     *
     * Malformed dates pass silently — we delegate date-format validation
     * to the layer that parsed the input from the user. This guard only
     * concerns itself with period status.
     */
    public function assertDateOpen(string $date): void
    {
        if (!preg_match('/^(\d{4})-(\d{2})-\d{2}$/', $date, $m)) {
            return;
        }
        if ($this->isDateInClosedPeriod($m[1], $m[2])) {
            throw new DomainException(
                "Cannot post to closed period {$m[1]}-{$m[2]}. " .
                "Reopen the period (Accounting → Period Close → Reopen) " .
                "if you need to amend it."
            );
        }
    }
}
