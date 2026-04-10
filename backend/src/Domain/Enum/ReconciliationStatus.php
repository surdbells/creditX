<?php
declare(strict_types=1);
namespace App\Domain\Enum;

enum ReconciliationStatus: string
{
    case PENDING = 'pending';
    case MATCHED = 'matched';
    case EXCEPTION = 'exception';
    case RESOLVED = 'resolved';
}
