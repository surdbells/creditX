<?php
declare(strict_types=1);
namespace App\Domain\Enum;

enum BulkUploadItemStatus: string
{
    case PENDING = 'pending';
    case MATCHED = 'matched';
    case POSTED = 'posted';
    case FAILED = 'failed';
}
