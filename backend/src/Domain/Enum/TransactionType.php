<?php
declare(strict_types=1);
namespace App\Domain\Enum;

enum TransactionType: string
{
    case CR = 'CR';
    case DR = 'DR';
}
