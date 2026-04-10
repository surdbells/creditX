<?php
declare(strict_types=1);
namespace App\Domain\Enum;

enum FeeCalculationType: string
{
    case FLAT = 'flat';
    case PERCENTAGE = 'percentage';
}
