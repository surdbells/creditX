<?php
declare(strict_types=1);
namespace App\Domain\Enum;

enum CustomerLedgerStatus: string
{
    case ACTIVE = 'active';
    case CLOSED = 'closed';
    case FROZEN = 'frozen';
}
