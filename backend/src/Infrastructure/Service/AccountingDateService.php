<?php

declare(strict_types=1);

namespace App\Infrastructure\Service;

use App\Domain\Entity\AccountingCalendar;
use App\Domain\Entity\SystemSetting;
use App\Domain\Enum\BusinessDateStatus;
use App\Domain\Enum\SettingCategory;
use App\Domain\Enum\SettingType;
use App\Domain\Exception\DomainException;
use App\Domain\Repository\AccountingCalendarRepository;
use App\Domain\Repository\SystemSettingRepository;
use Doctrine\ORM\EntityManagerInterface;

/**
 * The accounting-date rule engine: what date a posting lands on, and whether
 * it is allowed to.
 *
 * Separates the SERVER date (when the entry was keyed) from the ACCOUNTING
 * date (the business date it belongs to). A branch that keys Friday's work on
 * Monday morning posts it to Friday — the accounting date — while the audit
 * trail keeps Monday's real timestamp.
 *
 * ## Permission names
 *
 * Registered as accounting.* to sit alongside the existing accounting
 * permissions, and resolved through PostingContext so super_admin bypasses
 * exactly as it does in RbacMiddleware.
 *
 *   accounting.post_current    post to the current accounting date
 *   accounting.backdate        post to an earlier date that is still OPEN
 *   accounting.override_date   choose the posting date at all (the date picker)
 *
 * "Maximum Backdate Days" appears in the spec under permissions, but a
 * permission here is boolean; it is implemented as the numeric setting
 * accounting.max_backdate_days, which is where the spec's own configuration
 * section puts it.
 *
 * ## Relationship to the monthly period
 *
 * This governs the DAILY calendar only. The monthly close (accounting_periods
 * / PeriodGuardService) still applies independently and is checked here too,
 * so a posting must clear both gates.
 */
final class AccountingDateService
{
    // Settings (§11)
    public const S_CURRENT_DATE      = 'accounting.current_date';
    public const S_ALLOW_BACKDATING  = 'accounting.allow_backdating';
    public const S_MAX_BACKDATE_DAYS = 'accounting.max_backdate_days';
    public const S_REQUIRE_APPROVAL  = 'accounting.require_approval_backdated';
    public const S_ALLOW_REOPEN      = 'accounting.allow_reopen_closed';
    public const S_ALLOW_WEEKEND     = 'accounting.allow_weekend_posting';
    public const S_ENFORCE           = 'accounting.enforce_accounting_date';

    // Permissions (§8)
    public const P_POST_CURRENT  = 'accounting.post_current';
    public const P_BACKDATE      = 'accounting.backdate';
    public const P_OVERRIDE_DATE = 'accounting.override_date';
    public const P_REOPEN        = 'accounting.reopen_period';
    public const P_RUN_EOD       = 'accounting.run_eod';

    public function __construct(
        private readonly AccountingCalendarRepository $calendarRepo,
        private readonly SettingsCacheService $settings,
        private readonly PeriodGuardService $periodGuard,
        private readonly SystemSettingRepository $settingRepo,
        private readonly EntityManagerInterface $em,
    ) {}

    // ── Dates ───────────────────────────────────────────────────────────────

    /** The real server date — when the entry is actually being keyed. */
    public function serverDate(): string
    {
        return (new \DateTimeImmutable('now', new \DateTimeZone($_ENV['APP_TIMEZONE'] ?? 'Africa/Lagos')))->format('Y-m-d');
    }

    /**
     * The Current Accounting Date — the default posting date for every module.
     *
     * Resolution order, each a fallback for a system that has not been set up
     * yet, so this never returns null and never blocks a fresh install:
     *   1. the accounting.current_date setting
     *   2. the earliest OPEN business date on the calendar
     *   3. the server date
     */
    public function currentAccountingDate(): string
    {
        $set = trim((string) $this->settings->get(self::S_CURRENT_DATE, ''));
        if ($this->isValidDate($set)) {
            return $set;
        }
        $open = $this->calendarRepo->findEarliestOpen();
        if ($open !== null) {
            return $open->getDateString();
        }
        return $this->serverDate();
    }

    /**
     * Move the Current Accounting Date. Only EOD (and the initial seed) should
     * call this — upserts the setting and drops the cache so the new date is
     * live for the very next posting.
     *
     * Does NOT flush: EOD calls this inside its own transaction so the date
     * advance commits atomically with the close of the previous date.
     */
    public function setCurrentAccountingDate(string $date): void
    {
        $this->assertValidDate($date);

        $setting = $this->settingRepo->findByKey(self::S_CURRENT_DATE);
        if ($setting === null) {
            $setting = new SystemSetting();
            $setting->setKey(self::S_CURRENT_DATE);
            $setting->setType(SettingType::STRING);
            $setting->setCategory(SettingCategory::GENERAL);
            $this->em->persist($setting);
        }
        $setting->setValue($date);
        $this->settings->invalidate();
    }

    /** Is the accounting-date framework switched on? Off = legacy behaviour. */
    public function isEnforced(): bool
    {
        return $this->settings->getBool(self::S_ENFORCE, false);
    }

    // ── Resolution ──────────────────────────────────────────────────────────

    /**
     * Decide the posting date for a transaction and confirm it is allowed.
     *
     * @param string|null $requested date the caller asked for, or null to take
     *                    the current accounting date (the normal path).
     * @return string validated Y-m-d
     *
     * @throws DomainException with the spec's exact operator-facing wording.
     */
    public function resolvePostingDate(?string $requested = null): string
    {
        $current = $this->currentAccountingDate();

        // Framework off: preserve today's behaviour exactly — the caller's date
        // wins, and only the existing monthly guard applies. This is what keeps
        // the change backward compatible until an operator enables it.
        if (!$this->isEnforced()) {
            $date = $this->isValidDate((string) $requested) ? (string) $requested : $current;
            $this->periodGuard->assertDateOpen($date);
            return $date;
        }

        if ($requested === null || trim($requested) === '') {
            $this->assertPostable($current);
            return $current;
        }

        $requested = trim($requested);
        $this->assertValidDate($requested);

        // Choosing any date other than the default is itself a privilege.
        if ($requested !== $current && !PostingContextRegistry::get()->has(self::P_OVERRIDE_DATE)
            && !PostingContextRegistry::get()->has(self::P_BACKDATE)) {
            throw new DomainException('You do not have permission to change the posting date.');
        }

        $this->assertPostable($requested);
        return $requested;
    }

    /**
     * The full rule set (§4, §5). Throws with the operator-facing message the
     * spec specifies; each branch is deliberately explicit so the reason a
     * posting was refused is never ambiguous.
     */
    public function assertPostable(string $date): void
    {
        $this->assertValidDate($date);
        $ctx = PostingContextRegistry::get();
        $current = $this->currentAccountingDate();

        // §5 — never, for anyone, including super admins and system jobs. A
        // future-dated entry misstates every report between now and then.
        if ($date > $current || $date > $this->serverDate()) {
            throw new DomainException('Future posting is not permitted.');
        }

        // The monthly close still governs, independently of the daily calendar.
        $this->periodGuard->assertDateOpen($date);

        $row = $this->calendarRepo->findByDate($date);

        // §6 — EOD holds the date; refuse until it finishes so nothing lands
        // between the trial-balance check and the close.
        if ($row !== null && $row->getStatus() === BusinessDateStatus::PROCESSING) {
            throw new DomainException('End-of-Day is running for ' . $date . '. Postings are locked until it completes.');
        }

        if ($row !== null && $row->getStatus() === BusinessDateStatus::CLOSED) {
            throw new DomainException('This accounting period has been closed.');
        }

        // A date the calendar has never seen, in the past, predates the
        // framework being switched on — allow it so historic data stays valid.
        if ($row !== null && $row->getStatus() === BusinessDateStatus::FUTURE) {
            throw new DomainException('Future posting is not permitted.');
        }

        if ($date === $current) {
            if (!$ctx->has(self::P_POST_CURRENT)) {
                throw new DomainException('You do not have permission to post financial transactions.');
            }
            $this->assertWeekendAllowed($date);
            return;
        }

        // ─── Backdated (§4) ───
        if (!$this->settings->getBool(self::S_ALLOW_BACKDATING, true)) {
            throw new DomainException('Backdated posting is disabled.');
        }
        if (!$ctx->has(self::P_BACKDATE)) {
            throw new DomainException('You do not have permission to post to a previous accounting date.');
        }

        $max = max(0, (int) $this->settings->get(self::S_MAX_BACKDATE_DAYS, 1));
        $days = $this->daysBetween($date, $current);
        if ($days > $max) {
            throw new DomainException(sprintf(
                'That date is %d day(s) before the current accounting date; backdating is limited to %d day(s).',
                $days, $max,
            ));
        }

        $this->assertWeekendAllowed($date);
    }

    /** True when the date differs from the current accounting date. */
    public function isBackdated(string $date): bool
    {
        return $date < $this->currentAccountingDate();
    }

    /** Does a backdated posting need manager approval before it lands (§10)? */
    public function backdatingRequiresApproval(): bool
    {
        return $this->settings->getBool(self::S_REQUIRE_APPROVAL, false);
    }

    // ── Calendar helpers ────────────────────────────────────────────────────

    /**
     * The calendar row for a date, created on demand. EOD and the calendar UI
     * use this so a date is materialised the moment it matters rather than
     * needing a backfill of every date since inception.
     */
    public function ensureRow(string $date, ?BusinessDateStatus $initial = null): AccountingCalendar
    {
        $this->assertValidDate($date);
        $row = $this->calendarRepo->findByDate($date);
        if ($row !== null) {
            return $row;
        }
        $row = new AccountingCalendar(new \DateTimeImmutable($date));
        $row->setStatus($initial ?? ($date > $this->currentAccountingDate()
            ? BusinessDateStatus::FUTURE
            : BusinessDateStatus::OPEN));
        $this->calendarRepo->persist($row);
        return $row;
    }

    /**
     * A snapshot for the UI: both dates, the calendar status, what comes next,
     * and what the signed-in user is allowed to do with the date picker (§12/§13).
     *
     * @return array<string, mixed>
     */
    public function status(): array
    {
        $current = $this->currentAccountingDate();
        $row = $this->calendarRepo->findByDate($current);
        $ctx = PostingContextRegistry::get();
        $lastEod = $this->calendarRepo->findLastCompletedEod();

        return [
            'server_date'            => $this->serverDate(),
            'accounting_date'        => $current,
            'status'                 => $row?->getStatus()->value ?? BusinessDateStatus::OPEN->value,
            'status_label'           => ($row?->getStatus() ?? BusinessDateStatus::OPEN)->label(),
            'next_accounting_date'   => (new \DateTimeImmutable($current))->modify('+1 day')->format('Y-m-d'),
            'last_eod_date'          => $lastEod?->getDateString(),
            'last_eod_completed_at'  => $lastEod?->getEodCompletedAt()?->format('Y-m-d H:i:s'),
            'enforced'               => $this->isEnforced(),
            'open_dates'             => array_map(fn($c) => $c->getDateString(), $this->calendarRepo->findAllOpen()),
            'settings'               => [
                'allow_backdating'   => $this->settings->getBool(self::S_ALLOW_BACKDATING, true),
                'max_backdate_days'  => (int) $this->settings->get(self::S_MAX_BACKDATE_DAYS, 1),
                'require_approval'   => $this->backdatingRequiresApproval(),
                'allow_reopen'       => $this->settings->getBool(self::S_ALLOW_REOPEN, true),
                'allow_weekend'      => $this->settings->getBool(self::S_ALLOW_WEEKEND, true),
            ],
            'can' => [
                'post_current'  => $ctx->has(self::P_POST_CURRENT),
                'backdate'      => $ctx->has(self::P_BACKDATE),
                'override_date' => $ctx->has(self::P_OVERRIDE_DATE),
                'reopen'        => $ctx->has(self::P_REOPEN),
                'run_eod'       => $ctx->has(self::P_RUN_EOD),
            ],
        ];
    }

    // ── Internals ───────────────────────────────────────────────────────────

    private function assertWeekendAllowed(string $date): void
    {
        if ($this->settings->getBool(self::S_ALLOW_WEEKEND, true)) {
            return;
        }
        $dow = (int) (new \DateTimeImmutable($date))->format('N'); // 6 Sat, 7 Sun
        if ($dow >= 6) {
            throw new DomainException('Weekend posting is not permitted.');
        }
    }

    private function daysBetween(string $earlier, string $later): int
    {
        return (int) (new \DateTimeImmutable($earlier))->diff(new \DateTimeImmutable($later))->days;
    }

    private function isValidDate(string $d): bool
    {
        return $d !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) === 1;
    }

    private function assertValidDate(string $d): void
    {
        if (!$this->isValidDate($d)) {
            throw new DomainException('Posting date must be a valid date (YYYY-MM-DD).');
        }
    }
}
