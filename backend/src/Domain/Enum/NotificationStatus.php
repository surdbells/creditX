<?php
declare(strict_types=1);
namespace App\Domain\Enum;

enum NotificationStatus: string
{
    case QUEUED = 'queued';
    case SENT = 'sent';
    case DELIVERED = 'delivered';
    case FAILED = 'failed';
}
