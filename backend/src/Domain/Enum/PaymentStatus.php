<?php
declare(strict_types=1);
namespace App\Domain\Enum;

enum PaymentStatus: string
{
    case PENDING = 'pending';
    case SUCCESS = 'success';
    case FAILED = 'failed';
    case REVERSED = 'reversed';
}
