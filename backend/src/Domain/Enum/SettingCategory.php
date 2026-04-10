<?php

declare(strict_types=1);

namespace App\Domain\Enum;

enum SettingCategory: string
{
    case GENERAL = 'general';
    case APPROVAL = 'approval';
    case SECURITY = 'security';
    case NOTIFICATION = 'notification';
    case PENALTY = 'penalty';
    case PAYMENT = 'payment';
    case ACCOUNTING = 'accounting';
}
