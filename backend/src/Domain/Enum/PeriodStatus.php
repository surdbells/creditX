<?php
declare(strict_types=1);
namespace App\Domain\Enum;

enum PeriodStatus: string
{
    case OPEN = 'open';
    case CLOSED = 'closed';
}
