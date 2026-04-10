<?php
declare(strict_types=1);
namespace App\Domain\Enum;

enum PaymentChannel: string
{
    case CARD = 'card';
    case BANK_TRANSFER = 'bank_transfer';
    case USSD = 'ussd';
    case CASH = 'cash';
    case BULK_UPLOAD = 'bulk_upload';
}
