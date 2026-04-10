<?php
declare(strict_types=1);
namespace App\Domain\Enum;

enum LedgerType: string
{
    case GENERAL = 'general';
    case CUSTOMER = 'customer';
}
