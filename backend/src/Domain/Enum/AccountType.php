<?php
declare(strict_types=1);
namespace App\Domain\Enum;

enum AccountType: string
{
    case ASSET = 'asset';
    case LIABILITY = 'liability';
    case INCOME = 'income';
    case EXPENSE = 'expense';
    case EQUITY = 'equity';
}
