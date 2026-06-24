<?php

declare(strict_types=1);

namespace App\Domain\Enum;

/**
 * Lifecycle of a customer's self-service portal account. Distinct from
 * the customer record itself (a customer may exist — captured by an agent —
 * without ever enabling portal access).
 *
 *  - PENDING:   self-registered, email not yet verified. Cannot log in.
 *  - ACTIVE:    email verified, full portal access.
 *  - SUSPENDED: access revoked by staff. Cannot log in.
 */
enum CustomerPortalStatus: string
{
    case PENDING = 'pending';
    case ACTIVE = 'active';
    case SUSPENDED = 'suspended';

    public function label(): string
    {
        return match ($this) {
            self::PENDING   => 'Pending',
            self::ACTIVE    => 'Active',
            self::SUSPENDED => 'Suspended',
        };
    }
}
