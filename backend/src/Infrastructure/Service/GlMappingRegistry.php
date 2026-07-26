<?php

declare(strict_types=1);

namespace App\Infrastructure\Service;

/**
 * Canonical registry of the GL "roles" that drive loan-lifecycle postings.
 *
 * Every posting service used to hardcode a GL account code — findByCode('LR'),
 * findByCode('II'), etc. — with no place to see or change them. This registry
 * names each of those roles, records the historic default code, and is the
 * single source of truth the Default Ledgers admin page, the GlMappingService
 * resolver, and the posting services all read from.
 *
 * An operator can point a role at a DIFFERENT GL account via
 * gl_account_mappings (see GlAccountMapping); when a role is unmapped the
 * resolver falls back to the default code here, so wiring the resolver through
 * a posting service is behaviour-preserving until someone overrides it.
 *
 * Fees are intentionally NOT here: each fee type already carries its own GL
 * (FeeType.glAccountId), and the disbursement settlement account is chosen by
 * the operator per batch. Those stay where they are.
 */
final class GlMappingRegistry
{
    // Role keys — stable identifiers used by the API, the mapping rows and the
    // posting services. Do not rename once shipped (mapping rows key off them).
    public const LOAN_RECEIVABLE       = 'loan.receivable';
    public const CUSTOMER_CONTROL      = 'loan.customer_control';
    public const REPAYMENT_SETTLEMENT  = 'loan.repayment_settlement';
    public const INTEREST_INCOME       = 'loan.interest_income';
    public const INTEREST_RECEIVABLE   = 'loan.interest_receivable';
    public const INTEREST_SUSPENSE     = 'loan.interest_suspense';
    public const PENALTY_INCOME        = 'loan.penalty_income';
    public const BAD_DEBT_EXPENSE      = 'loan.bad_debt_expense';
    public const LOSS_PROVISION        = 'loan.loss_provision';
    public const LOSS_ALLOWANCE        = 'loan.loss_allowance';

    /**
     * Ordered role definitions. Each: key, label, category, default_code,
     * lifecycle stage it fires in, and a plain-English description.
     *
     * @return list<array{key:string, label:string, category:string, default_code:string, stage:string, description:string}>
     */
    public const ROLES = [
        [
            'key' => self::LOAN_RECEIVABLE,
            'label' => 'Loan Receivable',
            'category' => 'Principal',
            'default_code' => 'LR',
            'stage' => 'Disbursement · Repayment · Payoff · Write-off',
            'description' => 'Portfolio asset — the aggregate amount owed by borrowers. Debited at disbursement, credited as principal is repaid, paid off, or written off.',
        ],
        [
            'key' => self::CUSTOMER_CONTROL,
            'label' => 'Customer Balance Control',
            'category' => 'Principal',
            'default_code' => 'CUBGL',
            'stage' => 'Disbursement',
            'description' => 'Per-customer sub-ledger control account. Fees, top-up and net disbursed move through it at disbursement.',
        ],
        [
            'key' => self::REPAYMENT_SETTLEMENT,
            'label' => 'Default Repayment Settlement',
            'category' => 'Settlement',
            'default_code' => 'BANK',
            'stage' => 'Repayment · Payoff',
            'description' => 'Bank / cash account credited with incoming loan repayments when no other settlement account is specified.',
        ],
        [
            'key' => self::INTEREST_INCOME,
            'label' => 'Interest Income',
            'category' => 'Interest',
            'default_code' => 'II',
            'stage' => 'Repayment · Payoff · Accrual',
            'description' => 'Income recognised on interest collected (cash basis) or released from receivable/suspense (accrual basis).',
        ],
        [
            'key' => self::INTEREST_RECEIVABLE,
            'label' => 'Interest Receivable',
            'category' => 'Interest',
            'default_code' => 'INTRECV',
            'stage' => 'Accrual · Repayment',
            'description' => 'Asset for interest accrued but not yet collected on performing loans.',
        ],
        [
            'key' => self::INTEREST_SUSPENSE,
            'label' => 'Interest in Suspense',
            'category' => 'Interest',
            'default_code' => 'INTSUSP',
            'stage' => 'Accrual · Repayment',
            'description' => 'Contra-asset holding interest accrued on non-performing loans that was not taken to income. Released to income when collected.',
        ],
        [
            'key' => self::PENALTY_INCOME,
            'label' => 'Penalty Income',
            'category' => 'Penalty',
            'default_code' => 'PI',
            'stage' => 'Overdue',
            'description' => 'Income recognised when a late-payment penalty is charged on an overdue installment.',
        ],
        [
            'key' => self::BAD_DEBT_EXPENSE,
            'label' => 'Bad Debt Expense',
            'category' => 'Write-off',
            'default_code' => 'BDE',
            'stage' => 'Write-off',
            'description' => 'Expense recognised when an uncollectable loan is written off against the receivable.',
        ],
        [
            'key' => self::LOSS_PROVISION,
            'label' => 'Loan Loss Provision',
            'category' => 'Provisioning',
            'default_code' => 'LLP',
            'stage' => 'Provisioning',
            'description' => 'Prudential provision expense (CBN) recognised when the required allowance increases.',
        ],
        [
            'key' => self::LOSS_ALLOWANCE,
            'label' => 'Allowance for Loan Losses',
            'category' => 'Provisioning',
            'default_code' => 'ALLOW',
            'stage' => 'Provisioning',
            'description' => 'Contra-asset accumulating loan loss provisions against the portfolio.',
        ],
    ];

    /** @return list<array{key:string, label:string, category:string, default_code:string, stage:string, description:string}> */
    public static function all(): array
    {
        return self::ROLES;
    }

    public static function isRole(string $key): bool
    {
        foreach (self::ROLES as $r) {
            if ($r['key'] === $key) return true;
        }
        return false;
    }

    /** @return array{key:string, label:string, category:string, default_code:string, stage:string, description:string}|null */
    public static function byKey(string $key): ?array
    {
        foreach (self::ROLES as $r) {
            if ($r['key'] === $key) return $r;
        }
        return null;
    }

    /** Reverse lookup: the role key whose historic default code is $code, or null. */
    public static function keyForCode(string $code): ?string
    {
        $code = strtoupper($code);
        foreach (self::ROLES as $r) {
            if (strtoupper($r['default_code']) === $code) return $r['key'];
        }
        return null;
    }

    public static function defaultCode(string $key): ?string
    {
        return self::byKey($key)['default_code'] ?? null;
    }
}
