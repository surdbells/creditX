<?php
declare(strict_types=1);
namespace App\Domain\Enum;

enum ReconciliationMatchType: string
{
    case EXACT = 'exact';
    case PARTIAL = 'partial';
    case MANUAL = 'manual';
    case UNMATCHED_BANK = 'unmatched_bank';
    case UNMATCHED_SYSTEM = 'unmatched_system';
}
