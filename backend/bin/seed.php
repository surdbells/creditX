<?php

declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use App\Domain\Entity\Location;
use App\Domain\Entity\Permission;
use App\Domain\Entity\Role;
use App\Domain\Entity\SystemSetting;
use App\Domain\Entity\User;
use App\Domain\Enum\LocationType;
use App\Domain\Enum\SettingCategory;
use App\Domain\Enum\SettingType;
use App\Domain\Enum\UserStatus;
use App\Infrastructure\Persistence\DoctrineEntityManagerFactory;
use App\Infrastructure\Service\PasswordService;

$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
$dotenv->load();

// Force production mode for CLI to reduce memory
$_ENV['APP_ENV'] = 'production';

$em = DoctrineEntityManagerFactory::create();

echo "=== CreditX v2.0 Database Seeder ===\n\n";

// ─── 1. Permissions ───
echo "[1/5] Seeding permissions...\n";

$permissionsDef = [
    'users' => [
        ['users.view', 'View Users'],
        ['users.create', 'Create Users'],
        ['users.edit', 'Edit Users'],
        ['users.delete', 'Delete Users'],
    ],
    'roles' => [
        ['roles.view', 'View Roles'],
        ['roles.create', 'Create Roles'],
        ['roles.edit', 'Edit Roles'],
        ['roles.delete', 'Delete Roles'],
    ],
    'locations' => [
        ['locations.view', 'View Locations'],
        ['locations.create', 'Create Locations'],
        ['locations.edit', 'Edit Locations'],
        ['locations.delete', 'Delete Locations'],
    ],
    'settings' => [
        ['settings.view', 'View Settings'],
        ['settings.create', 'Create Settings'],
        ['settings.edit', 'Edit Settings'],
        ['settings.delete', 'Delete Settings'],
    ],
    'audit' => [
        ['audit.view', 'View Audit Logs'],
    ],
    'records' => [
        ['records.view', 'View Government Records'],
        ['records.create', 'Create Government Records'],
        ['records.edit', 'Edit Government Records'],
        ['records.delete', 'Delete Government Records'],
        ['records.import', 'Import Government Records'],
        ['record_types.view', 'View Record Types'],
        ['record_types.create', 'Create Record Types'],
        ['record_types.edit', 'Edit Record Types'],
        ['record_types.delete', 'Delete Record Types'],
    ],
    'customers' => [
        ['customers.view', 'View Customers'],
        ['customers.create', 'Create Customers'],
        ['customers.edit', 'Edit Customers'],
        ['customers.delete', 'Delete Customers'],
    ],
    'loans' => [
        ['loans.view', 'View Loans'],
        ['loans.create', 'Create Loans'],
        ['loans.edit', 'Edit Loans'],
        ['loans.approve', 'Approve Loans'],
        ['loans.reject', 'Reject Loans'],
        ['loans.disburse', 'Disburse Loans'],
        ['loans.close', 'Close Loans'],
        ['loans.write_off', 'Write Off Loans'],
        ['loans.restructure', 'Restructure Loans'],
    ],
    'products' => [
        ['products.view', 'View Loan Products'],
        ['products.create', 'Create Loan Products'],
        ['products.edit', 'Edit Loan Products'],
        ['products.delete', 'Delete Loan Products'],
    ],
    'accounting' => [
        ['accounting.view', 'View Chart of Accounts'],
        ['accounting.create', 'Create GL Accounts'],
        ['accounting.edit', 'Edit GL Accounts'],
        ['accounting.journal', 'Post Journal Entries'],
        ['accounting.reverse', 'Reverse Journal Entries'],
    ],
    'deposits' => [
        ['deposits.view', 'View Deposit Products & Accounts'],
        ['deposits.create', 'Create/Edit Deposit Products'],
        ['deposits.transact', 'Open Accounts & Post Deposits/Withdrawals'],
        ['deposits.interest', 'Run Deposit Interest Accrual'],
    ],
    'investments' => [
        ['investments.view', 'View Investment Products & Investments'],
        ['investments.create', 'Create/Edit Investment Products'],
        ['investments.transact', 'Place, Top Up, Withdraw & Settle Investments'],
        ['investments.interest', 'Run Investment Interest Accrual'],
    ],
    'payments' => [
        ['payments.view', 'View Payments'],
        ['payments.create', 'Post Payments'],
        ['payments.bulk_upload', 'Bulk Upload Payments'],
    ],
    'reports' => [
        ['reports.portfolio', 'View Portfolio Reports'],
        ['reports.par', 'View PAR Reports'],
        ['reports.performance.agents', 'View Agent Performance Report'],
        ['reports.performance.branches', 'View Branch Performance Report'],
        ['reports.performance.products', 'View Product Performance Report'],
        ['reports.performance.approvers', 'View Approver Performance Report'],
        ['reports.general_loans', 'View General Loan Report'],
        ['reports.cbn', 'View CBN Reports'],
        ['reports.reconciliation', 'View Reconciliation'],
        ['reports.export', 'Export Reports'],
    ],
    'notifications' => [
        ['notifications.view', 'View Notifications'],
        ['notifications.manage', 'Manage Notification Templates'],
    ],
    'messaging' => [
        ['messaging.view', 'View Messages'],
        ['messaging.send', 'Send Messages'],
    ],
    'maker_checker' => [
        ['maker_checker.make', 'Submit Maker-Checker Requests'],
        ['maker_checker.check', 'Approve/Reject Maker-Checker Requests'],
    ],
];

$permissionEntities = [];
$permCount = 0;
foreach ($permissionsDef as $module => $perms) {
    foreach ($perms as [$slug, $name]) {
        $existing = $em->getRepository(Permission::class)->findOneBy(['slug' => $slug]);
        if ($existing !== null) {
            $permissionEntities[$slug] = $existing;
            continue;
        }
        $p = new Permission();
        $p->setSlug($slug);
        $p->setName($name);
        $p->setModule($module);
        $em->persist($p);
        $permissionEntities[$slug] = $p;
        $permCount++;
    }
}
$em->flush();
$em->clear();
echo "  Created {$permCount} permissions\n";

// Reload permission entities for role assignment
$allPerms = $em->getRepository(Permission::class)->findAll();
$permissionEntities = [];
foreach ($allPerms as $p) {
    $permissionEntities[$p->getSlug()] = $p;
}

// ─── 2. Roles ───
echo "[2/5] Seeding roles...\n";

$rolesDef = [
    ['Super Admin', 'super_admin', 'Full system access', true, array_keys($permissionEntities)],
    ['Admin', 'admin', 'Administrative access', true, array_keys($permissionEntities)],
    ['Operations Head', 'operations_head', 'Head of operations — loan oversight', true, [
        'loans.view', 'loans.approve', 'loans.reject', 'loans.disburse', 'loans.close', 'loans.write_off', 'loans.restructure',
        'customers.view', 'records.view', 'products.view', 'accounting.view',
        'payments.view', 'reports.portfolio', 'reports.par',
        'reports.performance.agents', 'reports.performance.branches', 'reports.performance.products', 'reports.performance.approvers',
        'reports.general_loans',
        'reports.cbn', 'reports.export',
        'messaging.view', 'messaging.send', 'maker_checker.check', 'notifications.view',
    ]],
    ['Underwriter', 'underwriter', 'Loan underwriting and approval', true, [
        'loans.view', 'loans.approve', 'loans.reject',
        'customers.view', 'records.view', 'products.view',
        'reports.portfolio', 'reports.par', 'messaging.view', 'messaging.send', 'notifications.view',
    ]],
    ['Loan Officer', 'loan_officer', 'Loan processing and management', true, [
        'loans.view', 'loans.create', 'loans.edit', 'loans.approve',
        'customers.view', 'customers.create', 'customers.edit',
        'records.view', 'products.view', 'payments.view',
        'reports.portfolio', 'messaging.view', 'messaging.send', 'notifications.view',
    ]],
    ['Accountant', 'accountant', 'Financial operations and reporting', true, [
        'accounting.view', 'accounting.create', 'accounting.edit', 'accounting.journal', 'accounting.reverse',
        'deposits.view', 'deposits.create', 'deposits.transact', 'deposits.interest',
        'investments.view', 'investments.create', 'investments.transact', 'investments.interest',
        'payments.view', 'payments.create', 'payments.bulk_upload',
        'loans.view', 'customers.view',
        'reports.portfolio', 'reports.par',
        'reports.performance.agents', 'reports.performance.branches', 'reports.performance.products', 'reports.performance.approvers',
        'reports.general_loans',
        'reports.cbn', 'reports.reconciliation', 'reports.export',
        'maker_checker.make', 'notifications.view',
    ]],
    ['Compliance Officer', 'compliance_officer', 'Regulatory compliance and reporting', true, [
        'loans.view', 'customers.view', 'accounting.view',
        'reports.portfolio', 'reports.par', 'reports.cbn', 'reports.general_loans', 'reports.export',
        'audit.view', 'notifications.view',
    ]],
    ['Agent', 'agent', 'Field agent — loan origination', true, [
        'loans.view', 'loans.create',
        'customers.view', 'customers.create', 'customers.edit',
        'records.view',
        'messaging.view', 'messaging.send', 'notifications.view',
        'settings.view',
    ]],
];

$roleCount = 0;
foreach ($rolesDef as [$name, $slug, $desc, $isSystem, $permSlugs]) {
    $existing = $em->getRepository(Role::class)->findOneBy(['slug' => $slug]);
    if ($existing !== null) {
        continue;
    }
    $role = new Role();
    $role->setName($name);
    $role->setSlug($slug);
    $role->setDescription($desc);
    $role->setIsSystem($isSystem);
    foreach ($permSlugs as $ps) {
        if (isset($permissionEntities[$ps])) {
            $role->addPermission($permissionEntities[$ps]);
        }
    }
    $em->persist($role);
    $roleCount++;
}
$em->flush();
$em->clear();
echo "  Created {$roleCount} roles\n";

// ─── 3. Default Location ───
echo "[3/5] Seeding default location...\n";

$existingLoc = $em->getRepository(Location::class)->findOneBy(['code' => 'HQ']);
if ($existingLoc === null) {
    $hq = new Location();
    $hq->setName('Head Office');
    $hq->setCode('HQ');
    $hq->setType(LocationType::HEAD_OFFICE);
    $hq->setState('Lagos');
    $hq->setAddress('Lagos, Nigeria');
    $em->persist($hq);
    $em->flush();
    $em->clear();
    echo "  Created Head Office location\n";
} else {
    echo "  Head Office already exists\n";
}

// ─── 4. System Settings ───
echo "[4/5] Seeding system settings...\n";

$settingsDef = [
    // Approval settings
    ['approval.default_mode', 'sequential', SettingType::STRING, SettingCategory::APPROVAL, 'Default approval workflow mode (sequential or parallel)'],
    ['approval.conditional_routing_enabled', 'true', SettingType::BOOLEAN, SettingCategory::APPROVAL, 'Enable conditional approval routing based on loan attributes'],
    ['approval.sla_tracking_enabled', 'true', SettingType::BOOLEAN, SettingCategory::APPROVAL, 'Enable SLA tracking for approval steps'],
    ['approval.auto_escalation_enabled', 'false', SettingType::BOOLEAN, SettingCategory::APPROVAL, 'Enable auto-escalation when SLA is breached'],

    // Security settings
    ['security.maker_checker_disbursement', 'true', SettingType::BOOLEAN, SettingCategory::SECURITY, 'Require maker-checker for disbursements'],
    ['security.maker_checker_write_off', 'true', SettingType::BOOLEAN, SettingCategory::SECURITY, 'Require maker-checker for write-offs'],
    ['security.maker_checker_gl_entry', 'false', SettingType::BOOLEAN, SettingCategory::SECURITY, 'Require maker-checker for manual GL entries'],
    ['security.maker_checker_reversal', 'true', SettingType::BOOLEAN, SettingCategory::SECURITY, 'Require maker-checker for journal reversals'],
    ['security.session_timeout_minutes', '30', SettingType::INTEGER, SettingCategory::SECURITY, 'Session timeout in minutes'],
    ['security.max_login_attempts', '5', SettingType::INTEGER, SettingCategory::SECURITY, 'Maximum failed login attempts before lockout'],
    ['registration.require_approval', 'true', SettingType::BOOLEAN, SettingCategory::SECURITY, 'Hold self-service portal registrations for 2-level staff approval after email verification'],

    // Penalty settings
    ['penalty.default_grace_period_days', '5', SettingType::INTEGER, SettingCategory::PENALTY, 'Default grace period before penalty applies'],
    ['penalty.overdue_check_enabled', 'true', SettingType::BOOLEAN, SettingCategory::PENALTY, 'Enable daily overdue loan detection'],
    ['penalty.payment_allocation_order', '["penalty","interest","principal"]', SettingType::JSON, SettingCategory::PENALTY, 'Payment allocation priority order'],
    ['penalty.apply_after_maturity_only', 'false', SettingType::BOOLEAN, SettingCategory::PENALTY, 'Only apply penalties after a loan passes its maturity date (last installment due date)'],
    ['topup.calc_method', 'principal_minus_current', SettingType::STRING, SettingCategory::PAYMENT, 'Top-up carry-forward calc: principal_minus_current (future principal less current month + arrears) or full_outstanding'],
    ['loan.liquidation_charge_mode', 'subtotal_pct', SettingType::STRING, SettingCategory::PAYMENT, 'Loan payoff liquidation charge basis: subtotal_pct, principal_pct or flat'],
    ['loan.liquidation_charge_value', '0.012', SettingType::STRING, SettingCategory::PAYMENT, 'Loan payoff liquidation charge value (decimal fraction for pct modes, e.g. 0.012 = 1.2%; or flat amount)'],

    // Notification settings
    ['notification.email_enabled', 'true', SettingType::BOOLEAN, SettingCategory::NOTIFICATION, 'Enable email notifications'],
    ['notification.sms_enabled', 'true', SettingType::BOOLEAN, SettingCategory::NOTIFICATION, 'Enable SMS notifications'],
    ['notification.whatsapp_enabled', 'false', SettingType::BOOLEAN, SettingCategory::NOTIFICATION, 'Enable WhatsApp notifications'],

    // General settings
    ['general.company_name', 'CreditX', SettingType::STRING, SettingCategory::GENERAL, 'Company display name'],
    ['general.currency', 'NGN', SettingType::STRING, SettingCategory::GENERAL, 'Default currency code'],
    ['general.currency_symbol', '₦', SettingType::STRING, SettingCategory::GENERAL, 'Currency display symbol'],
    ['mobile.min_agent_version', '1.0.0', SettingType::STRING, SettingCategory::GENERAL, 'Minimum agent mobile app version this API supports (semver); older apps are asked to update'],
    ['general.max_customer_age', '57', SettingType::INTEGER, SettingCategory::GENERAL, 'Maximum customer age for eligibility'],
    ['general.max_service_years', '33', SettingType::INTEGER, SettingCategory::GENERAL, 'Maximum years of service for eligibility'],
    ['agent.monthly_target', '1000000', SettingType::INTEGER, SettingCategory::GENERAL, 'Default monthly disbursement target (naira) for agents without an individual target set'],

    // Accounting settings
    ['accounting.batch_validation_cutoff_at', '', SettingType::STRING, SettingCategory::ACCOUNTING, 'ISO timestamp; ledger batches whose oldest row predates this cutoff are exempt from balance validation. Set to NOW() after running the Phase-1 hotfix migrations on tenants with historical data.'],
    ['accounting.reconciliation_alert_threshold', '0.01', SettingType::STRING, SettingCategory::ACCOUNTING, 'Total-discrepancy threshold (naira) above which the daily GL reconciliation scan dispatches an in-app alert. 0 = alert on any non-zero discrepancy.'],
];

$settingCount = 0;
foreach ($settingsDef as [$key, $value, $type, $category, $description]) {
    $existing = $em->getRepository(SystemSetting::class)->findOneBy(['key' => $key]);
    if ($existing !== null) {
        continue;
    }
    $s = new SystemSetting();
    $s->setKey($key);
    $s->setValue($value);
    $s->setType($type);
    $s->setCategory($category);
    $s->setDescription($description);
    $em->persist($s);
    $settingCount++;
}
$em->flush();
$em->clear();
echo "  Created {$settingCount} settings\n";

// ─── 5. Super Admin User ───
echo "[5/5] Seeding super admin user...\n";

$existingAdmin = $em->getRepository(User::class)->findOneBy(['email' => 'admin@dostsuite.com']);
if ($existingAdmin === null) {
    $superAdminRole = $em->getRepository(Role::class)->findOneBy(['slug' => 'super_admin']);
    $hqLocation = $em->getRepository(Location::class)->findOneBy(['code' => 'HQ']);

    $admin = new User();
    $admin->setFirstName('System');
    $admin->setLastName('Administrator');
    $admin->setEmail('admin@dostsuite.com');
    $admin->setPasswordHash(PasswordService::hash('Admin@123456'));
    $admin->setPhone('+2340000000000');
    $admin->setStatus(UserStatus::ACTIVE);
    if ($superAdminRole) $admin->addRole($superAdminRole);
    if ($hqLocation) $admin->addLocation($hqLocation);
    $em->persist($admin);
    $em->flush();
    $em->clear();
    echo "  Created super admin: admin@dostsuite.com / Admin@123456\n";
} else {
    echo "  Super admin already exists\n";
}

echo "\n=== Seeding complete ===\n";

// ─── 6. Record Types ───
echo "[6/6] Seeding record types...\n";

use App\Domain\Entity\RecordType;

$recordTypesDef = [
    [
        'name' => 'IPPIS',
        'code' => 'IPPIS',
        'description' => 'Integrated Payroll and Personnel Information System — Federal government employees',
        'field_config' => ['label_overrides' => ['staff_id' => 'IPPIS Number'], 'required_fields' => ['gross_pay', 'organization']],
        'eligibility_rules' => ['max_age' => 57, 'max_service_years' => 33],
    ],
    [
        'name' => 'TESCOM',
        'code' => 'TESCOM',
        'description' => 'Teaching Service Commission — State teaching staff',
        'field_config' => ['label_overrides' => ['staff_id' => 'TESCOM Staff ID'], 'required_fields' => ['organization']],
        'eligibility_rules' => ['max_age' => 57, 'max_service_years' => 33],
    ],
    [
        'name' => 'Lagos State',
        'code' => 'LASG',
        'description' => 'Lagos State Government employees',
        'field_config' => ['label_overrides' => ['staff_id' => 'LASG Staff ID'], 'required_fields' => ['ministry']],
        'eligibility_rules' => ['max_age' => 57, 'max_service_years' => 33],
    ],
    [
        'name' => 'SUBEB',
        'code' => 'SUBEB',
        'description' => 'State Universal Basic Education Board employees',
        'field_config' => ['label_overrides' => ['staff_id' => 'SUBEB Staff ID'], 'required_fields' => ['organization']],
        'eligibility_rules' => ['max_age' => 57, 'max_service_years' => 33],
    ],
];

$rtCount = 0;
foreach ($recordTypesDef as $rtDef) {
    $existing = $em->getRepository(RecordType::class)->findOneBy(['code' => $rtDef['code']]);
    if ($existing !== null) continue;
    $rt = new RecordType();
    $rt->setName($rtDef['name']);
    $rt->setCode($rtDef['code']);
    $rt->setDescription($rtDef['description']);
    $rt->setFieldConfig($rtDef['field_config']);
    $rt->setEligibilityRules($rtDef['eligibility_rules']);
    $em->persist($rt);
    $rtCount++;
}
$em->flush();
$em->clear();
echo "  Created {$rtCount} record types\n";

echo "\n=== Seeding complete (all phases) ===\n";

// ─── 7. Fee Types ───
echo "[7/7] Seeding fee types...\n";

use App\Domain\Entity\FeeType;

$feeTypesDef = [
    ['Admin Fee', 'AF', 'Administrative processing fee', true],
    ['Insurance Fee', 'IF', 'Loan insurance premium', true],
    ['Management Fee', 'MF', 'Loan management fee', true],
    ['Bank Statement Fee', 'BSF', 'Bank statement processing fee', true],
    ['Processing Fee', 'PF', 'General processing fee', false],
];

$ftCount = 0;
foreach ($feeTypesDef as [$name, $code, $desc, $isSystem]) {
    $existing = $em->getRepository(FeeType::class)->findOneBy(['code' => $code]);
    if ($existing !== null) continue;
    $ft = new FeeType();
    $ft->setName($name);
    $ft->setCode($code);
    $ft->setDescription($desc);
    $ft->setIsSystem($isSystem);
    $em->persist($ft);
    $ftCount++;
}
$em->flush();
$em->clear();
echo "  Created {$ftCount} fee types\n";

echo "\n=== All seeding complete ===\n";

// ─── 8. Default GL Accounts (Chart of Accounts) ───
echo "[8/8] Seeding chart of accounts...\n";

use App\Domain\Entity\GeneralLedger;
use App\Domain\Enum\AccountType;
use App\Domain\Enum\LedgerType;

$glDef = [
    // ── Assets (1xxx) ──
    ['Loan Receivable', '1001', 'LR', AccountType::ASSET, LedgerType::GENERAL, 'Total loan portfolio receivable'],
    ['Customer Balance', '1002', 'CUBGL', AccountType::ASSET, LedgerType::CUSTOMER, 'Customer loan balance accounts'],
    ['Bank/Cash', '1003', 'BANK', AccountType::ASSET, LedgerType::GENERAL, 'Bank and cash accounts'],
    ['Settlement Account', '1004', 'SETTLE', AccountType::ASSET, LedgerType::GENERAL, 'Loan settlement disbursement account'],
    ['Allowance for Loan Losses', '1005', 'ALLOW', AccountType::ASSET, LedgerType::GENERAL, 'Contra-asset for loan loss provisioning (CR-normal)'],
    ['Cash in Vault', '1006', 'VAULT', AccountType::ASSET, LedgerType::GENERAL, 'Physical cash held in branch vaults / tills'],
    ['Prepayments', '1007', 'PREPAY', AccountType::ASSET, LedgerType::GENERAL, 'Prepaid expenses (rent, insurance, subscriptions)'],
    ['Fixed Assets', '1008', 'FIXASSET', AccountType::ASSET, LedgerType::GENERAL, 'Property, plant and equipment at cost'],
    ['Accumulated Depreciation', '1009', 'ACCDEP', AccountType::ASSET, LedgerType::GENERAL, 'Contra-asset; accumulated depreciation on fixed assets (CR-normal)'],
    ['Suspense / Inter-branch', '1010', 'SUSPENSE', AccountType::ASSET, LedgerType::GENERAL, 'Temporary holding / inter-branch settlement account'],
    ['Interest Receivable', '1011', 'INTRECV', AccountType::ASSET, LedgerType::GENERAL, 'Accrued but uncollected loan interest (accrual basis)'],
    ['Interest in Suspense', '1012', 'INTSUSP', AccountType::ASSET, LedgerType::GENERAL, 'Contra-asset; accrued interest on non-performing loans not taken to income (CR-normal)'],
    // ── Liabilities (2xxx) ──
    ['Top-Up Balance', '2001', 'TUGL', AccountType::LIABILITY, LedgerType::GENERAL, 'Previous loan balance carried forward'],
    ['Customer Deposits', '2002', 'CUSTDEP', AccountType::LIABILITY, LedgerType::GENERAL, 'Customer savings / deposit liabilities (control account; subsidiary ledger is deposit_accounts)'],
    ['Interest Payable on Deposits', '2003', 'INTPAY', AccountType::LIABILITY, LedgerType::GENERAL, 'Accrued interest owed on customer deposits'],
    ['Tax Payable', '2004', 'TAXPAY', AccountType::LIABILITY, LedgerType::GENERAL, 'Income / withholding tax payable to authorities'],
    ['Accruals & Other Payables', '2005', 'ACCRPAY', AccountType::LIABILITY, LedgerType::GENERAL, 'Accrued expenses and sundry payables'],
    // ── Equity (3xxx) ──
    ['Retained Earnings', '3001', 'RETEARN', AccountType::EQUITY, LedgerType::GENERAL, 'Cumulative net income closed from prior periods'],
    ['Share Capital', '3002', 'SHARECAP', AccountType::EQUITY, LedgerType::GENERAL, 'Paid-up share capital contributed by owners'],
    ['Statutory Reserve', '3003', 'STATRES', AccountType::EQUITY, LedgerType::GENERAL, 'CBN-mandated statutory reserve appropriation'],
    ['Opening Balance Equity', '3004', 'OBE', AccountType::EQUITY, LedgerType::GENERAL, 'Contra-equity used to seed opening balances; nets to zero once balanced'],
    // ── Income (4xxx) ──
    ['Insurance Income', '4001', 'IA', AccountType::INCOME, LedgerType::GENERAL, 'Insurance fee income'],
    ['Admin Fee Income', '4002', 'AA', AccountType::INCOME, LedgerType::GENERAL, 'Administrative fee income'],
    ['Management Fee Income', '4003', 'MFA', AccountType::INCOME, LedgerType::GENERAL, 'Management fee income'],
    ['Bank Statement Fee Income', '4004', 'BSA', AccountType::INCOME, LedgerType::GENERAL, 'Bank statement fee income'],
    ['Interest Income', '4005', 'II', AccountType::INCOME, LedgerType::GENERAL, 'Loan interest income'],
    ['Penalty Income', '4006', 'PI', AccountType::INCOME, LedgerType::GENERAL, 'Late payment penalty income'],
    ['Processing Fee Income', '4007', 'PFI', AccountType::INCOME, LedgerType::GENERAL, 'Processing fee income'],
    ['Other Income', '4008', 'OTHINC', AccountType::INCOME, LedgerType::GENERAL, 'Sundry / miscellaneous income'],
    // ── Expenses (5xxx) ──
    ['Bad Debt Expense', '5001', 'BDE', AccountType::EXPENSE, LedgerType::GENERAL, 'Written-off loan expense'],
    ['Loan Loss Provision', '5002', 'LLP', AccountType::EXPENSE, LedgerType::GENERAL, 'Loan loss provision expense (CBN prudential)'],
    ['Salaries & Wages', '5003', 'SALARY', AccountType::EXPENSE, LedgerType::GENERAL, 'Staff salaries, wages and benefits'],
    ['Rent', '5004', 'RENT', AccountType::EXPENSE, LedgerType::GENERAL, 'Office and branch rent'],
    ['Utilities', '5005', 'UTIL', AccountType::EXPENSE, LedgerType::GENERAL, 'Electricity, water, internet and telephony'],
    ['Depreciation Expense', '5006', 'DEPEXP', AccountType::EXPENSE, LedgerType::GENERAL, 'Periodic depreciation of fixed assets'],
    ['Interest Expense on Deposits', '5007', 'INTEXP', AccountType::EXPENSE, LedgerType::GENERAL, 'Interest expense accrued on customer deposits'],
    ['Bank Charges', '5008', 'BANKCHG', AccountType::EXPENSE, LedgerType::GENERAL, 'Bank fees, COT and transaction charges'],
    ['General & Admin Expense', '5009', 'GENADMIN', AccountType::EXPENSE, LedgerType::GENERAL, 'Sundry general and administrative expenses'],
];

$glCount = 0;
foreach ($glDef as [$name, $number, $code, $type, $ledgerType, $desc]) {
    $existing = $em->getRepository(GeneralLedger::class)->findOneBy(['accountCode' => $code]);
    if ($existing !== null) continue;
    $gl = new GeneralLedger();
    $gl->setAccountName($name);
    $gl->setAccountNumber($number);
    $gl->setAccountCode($code);
    $gl->setAccountType($type);
    $gl->setLedgerType($ledgerType);
    $gl->setDescription($desc);
    $em->persist($gl);
    $glCount++;
}
$em->flush();
$em->clear();
echo "  Created {$glCount} GL accounts\n";

echo "\n=== All seeding complete (Phases 1-5) ===\n";
