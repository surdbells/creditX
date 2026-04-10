<?php
declare(strict_types=1);
namespace App\Domain\Enum;

enum LoanType: string
{
    case NEW_LOAN = 'new';
    case TOP_UP = 'top_up';
}
