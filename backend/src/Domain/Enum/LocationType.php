<?php

declare(strict_types=1);

namespace App\Domain\Enum;

enum LocationType: string
{
    case HEAD_OFFICE = 'head_office';
    case BRANCH = 'branch';
    case SATELLITE = 'satellite';

    public function label(): string
    {
        return match ($this) {
            self::HEAD_OFFICE => 'Head Office',
            self::BRANCH      => 'Branch',
            self::SATELLITE   => 'Satellite Office',
        };
    }
}
