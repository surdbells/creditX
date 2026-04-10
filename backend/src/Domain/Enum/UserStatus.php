<?php

declare(strict_types=1);

namespace App\Domain\Enum;

enum UserStatus: string
{
    case ACTIVE = 'active';
    case INACTIVE = 'inactive';
    case SUSPENDED = 'suspended';
    case PENDING = 'pending';

    public function label(): string
    {
        return match ($this) {
            self::ACTIVE    => 'Active',
            self::INACTIVE  => 'Inactive',
            self::SUSPENDED => 'Suspended',
            self::PENDING   => 'Pending',
        };
    }
}
