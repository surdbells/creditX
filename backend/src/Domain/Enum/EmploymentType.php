<?php
declare(strict_types=1);
namespace App\Domain\Enum;

/**
 * Employment classification captured on the self-service portal so that
 * non-government applicants (including the self-employed) have a real
 * affordability basis. The agent/government path does not use this — it
 * derives income from a matched GovernmentRecord instead.
 */
enum EmploymentType: string
{
    case EMPLOYED = 'EMPLOYED';
    case SELF_EMPLOYED = 'SELF_EMPLOYED';
    case BUSINESS_OWNER = 'BUSINESS_OWNER';
    case OTHER = 'OTHER';

    public function label(): string
    {
        return match ($this) {
            self::EMPLOYED       => 'Employed',
            self::SELF_EMPLOYED  => 'Self-employed',
            self::BUSINESS_OWNER => 'Business owner',
            self::OTHER          => 'Other',
        };
    }

    /** @return string[] */
    public static function values(): array
    {
        return array_map(static fn (self $c): string => $c->value, self::cases());
    }
}
