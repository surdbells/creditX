<?php
declare(strict_types=1);
namespace App\Domain\Enum;

enum ConditionOperator: string
{
    case GT = 'gt';
    case GTE = 'gte';
    case LT = 'lt';
    case LTE = 'lte';
    case EQ = 'eq';
    case IN = 'in';

    /**
     * Evaluate the condition against a value.
     */
    public function evaluate(mixed $actual, mixed $threshold): bool
    {
        return match ($this) {
            self::GT  => (float) $actual > (float) $threshold,
            self::GTE => (float) $actual >= (float) $threshold,
            self::LT  => (float) $actual < (float) $threshold,
            self::LTE => (float) $actual <= (float) $threshold,
            self::EQ  => (string) $actual === (string) $threshold,
            self::IN  => is_array($threshold) ? in_array((string) $actual, $threshold, true) : (string) $actual === (string) $threshold,
        };
    }
}
