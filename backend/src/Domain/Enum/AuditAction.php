<?php

declare(strict_types=1);

namespace App\Domain\Enum;

enum AuditAction: string
{
    case CREATE = 'create';
    case UPDATE = 'update';
    case DELETE = 'delete';
    case LOGIN = 'login';
    case LOGOUT = 'logout';
    case LOGIN_FAILED = 'login_failed';
    case PASSWORD_RESET = 'password_reset';
    case STATUS_CHANGE = 'status_change';
    case APPROVE = 'approve';
    case REJECT = 'reject';
    case DISBURSE = 'disburse';
    case PAYMENT = 'payment';
    case REVERSAL = 'reversal';
    case EXPORT = 'export';
    case IMPORT = 'import';
}
