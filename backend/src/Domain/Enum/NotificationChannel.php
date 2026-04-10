<?php
declare(strict_types=1);
namespace App\Domain\Enum;

enum NotificationChannel: string
{
    case EMAIL = 'email';
    case SMS = 'sms';
    case WHATSAPP = 'whatsapp';
    case IN_APP = 'in_app';
}
