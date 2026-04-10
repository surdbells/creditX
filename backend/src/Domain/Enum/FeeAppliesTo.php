<?php
declare(strict_types=1);
namespace App\Domain\Enum;

enum FeeAppliesTo: string
{
    case PRINCIPAL = 'principal';
    case GROSS_LOAN = 'gross_loan';
}
