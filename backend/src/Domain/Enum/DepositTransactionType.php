<?php
declare(strict_types=1);
namespace App\Domain\Enum;

/**
 * Classifies a movement on a deposit account. Each maps to a balanced GL
 * journal posted via LedgerService::postJournal:
 *
 *   DEPOSIT    — cash/transfer in:  DR Bank,            CR Customer Deposits
 *   WITHDRAWAL — cash/transfer out: DR Customer Deposits, CR Bank
 *   INTEREST   — interest credited: DR Interest Expense,  CR Customer Deposits
 *   CHARGE     — account fee:       DR Customer Deposits, CR Fee Income
 *   REVERSAL   — contra of a prior deposit transaction (mirrors its legs)
 */
enum DepositTransactionType: string
{
    case DEPOSIT    = 'deposit';
    case WITHDRAWAL = 'withdrawal';
    case INTEREST   = 'interest';
    case CHARGE     = 'charge';
    case REVERSAL   = 'reversal';
}
