<?php
declare(strict_types=1);
namespace App\Domain\Enum;

enum ApprovalStatus: string
{
    case PENDING = 'pending';
    case APPROVED = 'approved';
    case REJECTED = 'rejected';
    case ESCALATED = 'escalated';
    case AUTO_APPROVED = 'auto_approved';
    case SKIPPED = 'skipped';
}
