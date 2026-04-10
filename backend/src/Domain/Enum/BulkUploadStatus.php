<?php
declare(strict_types=1);
namespace App\Domain\Enum;

enum BulkUploadStatus: string
{
    case PENDING = 'pending';
    case PROCESSING = 'processing';
    case COMPLETED = 'completed';
    case FAILED = 'failed';
}
