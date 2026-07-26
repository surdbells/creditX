<?php

declare(strict_types=1);

namespace App\Infrastructure\Service;

/**
 * Who is posting, and what they are allowed to do — captured once per request
 * so posting services can enforce accounting-date rules without every one of
 * them taking a PSR-7 request.
 *
 * Also carries the forensic fields §9 requires on a backdated entry (IP,
 * device, browser), so the audit record can be written at the point of posting
 * rather than reconstructed later.
 *
 * Three kinds of actor:
 *   user    — a signed-in staff member; permissions decide what they may do.
 *   system  — a CLI/cron job (interest accrual, EOD). Trusted to post to the
 *             dates its own logic computes, because no human chose them.
 *   unknown — context was never set. Treated as the LEAST privileged: it may
 *             post to the current accounting date and nothing else, so a code
 *             path that forgets to establish context fails closed rather than
 *             silently granting backdating rights.
 */
final class PostingContext
{
    public const ACTOR_USER    = 'user';
    public const ACTOR_SYSTEM  = 'system';
    public const ACTOR_UNKNOWN = 'unknown';

    /**
     * @param string[] $permissions
     * @param string[] $roles
     */
    private function __construct(
        public readonly string $actorType,
        public readonly ?string $userId,
        public readonly array $permissions,
        public readonly array $roles,
        public readonly ?string $ipAddress,
        public readonly ?string $userAgent,
    ) {}

    /** @param string[] $permissions @param string[] $roles */
    public static function forUser(
        ?string $userId,
        array $permissions = [],
        array $roles = [],
        ?string $ipAddress = null,
        ?string $userAgent = null,
    ): self {
        return new self(self::ACTOR_USER, $userId, $permissions, $roles, $ipAddress, $userAgent);
    }

    /** A scheduled job or CLI script. */
    public static function system(?string $label = null): self
    {
        return new self(self::ACTOR_SYSTEM, $label, [], [], null, 'cli');
    }

    public static function unknown(): self
    {
        return new self(self::ACTOR_UNKNOWN, null, [], [], null, null);
    }

    public function isSystem(): bool { return $this->actorType === self::ACTOR_SYSTEM; }

    /** Super admin bypasses permission checks, matching RbacMiddleware. */
    public function isSuperAdmin(): bool { return in_array('super_admin', $this->roles, true); }

    public function has(string $permission): bool
    {
        if ($this->isSystem() || $this->isSuperAdmin()) {
            return true;
        }
        return in_array($permission, $this->permissions, true);
    }

    /**
     * Best-effort device/browser split from the user agent, for the audit
     * trail. Deliberately coarse — this is a forensic breadcrumb, not
     * analytics, and over-parsing user agents ages badly.
     */
    public function device(): ?string
    {
        if ($this->userAgent === null || $this->userAgent === '') return null;
        if ($this->userAgent === 'cli') return 'Server (CLI)';
        return match (true) {
            (bool) preg_match('/iPad|Tablet/i', $this->userAgent)      => 'Tablet',
            (bool) preg_match('/Mobi|Android|iPhone/i', $this->userAgent) => 'Mobile',
            default                                                     => 'Desktop',
        };
    }

    public function browser(): ?string
    {
        if ($this->userAgent === null || $this->userAgent === '') return null;
        if ($this->userAgent === 'cli') return 'CLI';
        return match (true) {
            (bool) preg_match('/Edg\//i', $this->userAgent)     => 'Edge',
            (bool) preg_match('/OPR\/|Opera/i', $this->userAgent) => 'Opera',
            (bool) preg_match('/Firefox\//i', $this->userAgent) => 'Firefox',
            (bool) preg_match('/Chrome\//i', $this->userAgent)  => 'Chrome',
            (bool) preg_match('/Safari\//i', $this->userAgent)  => 'Safari',
            default                                             => 'Other',
        };
    }
}
