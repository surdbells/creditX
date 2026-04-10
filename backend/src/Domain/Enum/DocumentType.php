<?php

declare(strict_types=1);

namespace App\Domain\Enum;

enum DocumentType: string
{
    case PASSPORT = 'passport';
    case ID_CARD = 'id_card';
    case PAYSLIP = 'payslip';
    case BANK_STATEMENT = 'bank_statement';
    case UTILITY_BILL = 'utility_bill';
    case WORK_ID = 'work_id';
    case OTHER = 'other';
}
