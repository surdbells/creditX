<?php
declare(strict_types=1);
namespace App\Domain\Enum;

enum InterestMethod: string
{
    case FLAT_RATE = 'flat_rate';
    case REDUCING_BALANCE = 'reducing_balance';
    case AMORTIZED = 'amortized';
}
