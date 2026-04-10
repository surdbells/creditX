<?php
declare(strict_types=1);
namespace App\Domain\Enum;

enum RepaymentStatus: string
{
    case PENDING = 'pending';
    case PAID = 'paid';
    case PARTIAL = 'partial';
    case OVERDUE = 'overdue';
    case WAIVED = 'waived';
}
