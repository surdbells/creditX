<?php
declare(strict_types=1);
namespace App\Domain\Enum;

enum ConversationStatus: string
{
    case OPEN = 'open';
    case RESOLVED = 'resolved';
    case CLOSED = 'closed';
}
