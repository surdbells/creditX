<?php
declare(strict_types=1);
namespace App\Domain\Enum;

enum PenaltyCalculationType: string
{
    case FLAT = 'flat';
    case PERCENTAGE = 'percentage';
}
