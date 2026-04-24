<?php

declare(strict_types=1);

/**
 * CreditX v2.0 — Lightweight Database Seeder
 * Uses raw DBAL (no ORM metadata loading) to avoid memory issues.
 */

require __DIR__ . '/../vendor/autoload.php';

$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
$dotenv->load();

$conn = \Doctrine\DBAL\DriverManager::getConnection([
    'driver'   => $_ENV['DB_DRIVER'] ?? 'pdo_pgsql',
    'host'     => $_ENV['DB_HOST'] ?? '127.0.0.1',
    'port'     => (int) ($_ENV['DB_PORT'] ?? 5432),
    'dbname'   => $_ENV['DB_NAME'] ?? 'creditx',
    'user'     => $_ENV['DB_USER'] ?? 'creditx_user',
    'password' => $_ENV['DB_PASSWORD'] ?? 'secret',
    'charset'  => $_ENV['DB_CHARSET'] ?? 'utf8',
]);

echo "=== CreditX v2.0 Database Seeder (DBAL) ===\n\n";

function uuid(): string { return \Ramsey\Uuid\Uuid::uuid4()->toString(); }
function now(): string { return (new DateTimeImmutable('now', new DateTimeZone($_ENV['APP_TIMEZONE'] ?? 'Africa/Lagos')))->format('Y-m-d H:i:s'); }

// ─── 1. Permissions ───
echo "[1/8] Seeding permissions...\n";

$permissionsDef = [
    'users' => [['users.view','View Users'],['users.create','Create Users'],['users.edit','Edit Users'],['users.delete','Delete Users']],
    'roles' => [['roles.view','View Roles'],['roles.create','Create Roles'],['roles.edit','Edit Roles'],['roles.delete','Delete Roles']],
    'locations' => [['locations.view','View Locations'],['locations.create','Create Locations'],['locations.edit','Edit Locations'],['locations.delete','Delete Locations']],
    'settings' => [['settings.view','View Settings'],['settings.create','Create Settings'],['settings.edit','Edit Settings'],['settings.delete','Delete Settings']],
    'audit' => [['audit.view','View Audit Logs']],
    'records' => [['records.view','View Government Records'],['records.create','Create Government Records'],['records.edit','Edit Government Records'],['records.delete','Delete Government Records'],['records.import','Import Government Records'],['record_types.view','View Record Types'],['record_types.create','Create Record Types'],['record_types.edit','Edit Record Types'],['record_types.delete','Delete Record Types']],
    'customers' => [['customers.view','View Customers'],['customers.create','Create Customers'],['customers.edit','Edit Customers'],['customers.delete','Delete Customers']],
    'loans' => [['loans.view','View Loans'],['loans.create','Create Loans'],['loans.edit','Edit Loans'],['loans.approve','Approve Loans'],['loans.reject','Reject Loans'],['loans.disburse','Disburse Loans'],['loans.close','Close Loans'],['loans.write_off','Write Off Loans'],['loans.restructure','Restructure Loans']],
    'products' => [['products.view','View Loan Products'],['products.create','Create Loan Products'],['products.edit','Edit Loan Products'],['products.delete','Delete Loan Products']],
    'accounting' => [['accounting.view','View Accounting'],['accounting.create','Create GL Accounts'],['accounting.edit','Edit GL Accounts'],['accounting.journal','Post Journal Entries'],['accounting.reverse','Reverse Journal Entries'],['accounting.close','Close/Reopen Periods'],['accounting.budget','Manage Budgets'],['accounting.provision','Run Loan Loss Provisioning']],
    'payments' => [['payments.view','View Payments'],['payments.create','Post Payments'],['payments.bulk_upload','Bulk Upload Payments']],
    'reports' => [['reports.portfolio','Portfolio Reports'],['reports.par','PAR Reports'],['reports.performance.agents','Agent Performance Report'],['reports.performance.branches','Branch Performance Report'],['reports.performance.products','Product Performance Report'],['reports.cbn','CBN Reports'],['reports.reconciliation','Reconciliation'],['reports.export','Export Reports']],
    'notifications' => [['notifications.view','View Notifications'],['notifications.manage','Manage Notification Templates']],
    'messaging' => [['messaging.view','View Messages'],['messaging.send','Send Messages']],
    'maker_checker' => [['maker_checker.make','Submit Maker-Checker Requests'],['maker_checker.check','Approve/Reject Maker-Checker Requests']],
];

$permIds = [];
$permCount = 0;
foreach ($permissionsDef as $module => $perms) {
    foreach ($perms as [$slug, $name]) {
        $existing = $conn->fetchOne("SELECT id FROM permissions WHERE slug = ?", [$slug]);
        if ($existing) { $permIds[$slug] = $existing; continue; }
        $id = uuid();
        $conn->insert('permissions', ['id' => $id, 'slug' => $slug, 'name' => $name, 'module' => $module, 'description' => $name, 'created_at' => now(), 'updated_at' => now()]);
        $permIds[$slug] = $id;
        $permCount++;
    }
}
echo "  Created {$permCount} permissions\n";

// ─── 2. Roles ───
echo "[2/8] Seeding roles...\n";

$allPermSlugs = array_keys($permIds);
$rolesDef = [
    ['Super Admin', 'super_admin', 'Full system access', true, $allPermSlugs],
    ['Admin', 'admin', 'Administrative access', true, $allPermSlugs],
    ['Operations Head', 'operations_head', 'Head of operations', true, ['loans.view','loans.approve','loans.reject','loans.disburse','loans.close','loans.write_off','loans.restructure','customers.view','records.view','products.view','accounting.view','payments.view','reports.portfolio','reports.par','reports.performance.agents','reports.performance.branches','reports.performance.products','reports.cbn','reports.export','messaging.view','messaging.send','maker_checker.check','notifications.view']],
    ['Underwriter', 'underwriter', 'Loan underwriting and approval', true, ['loans.view','loans.approve','loans.reject','customers.view','records.view','products.view','reports.portfolio','reports.par','messaging.view','messaging.send','notifications.view']],
    ['Loan Officer', 'loan_officer', 'Loan processing', true, ['loans.view','loans.create','loans.edit','loans.approve','customers.view','customers.create','customers.edit','records.view','products.view','payments.view','reports.portfolio','messaging.view','messaging.send','notifications.view']],
    ['Accountant', 'accountant', 'Financial operations', true, ['accounting.view','accounting.create','accounting.edit','accounting.journal','accounting.reverse','accounting.close','accounting.budget','accounting.provision','payments.view','payments.create','reports.portfolio','reports.par','reports.reconciliation','reports.cbn','reports.export','notifications.view']],
    ['Compliance Officer', 'compliance_officer', 'Regulatory compliance', true, ['loans.view','customers.view','records.view','accounting.view','reports.portfolio','reports.par','reports.cbn','reports.export','audit.view','notifications.view']],
    ['Agent', 'agent', 'Field agent / DSA', true, ['loans.view','loans.create','loans.edit','customers.view','customers.create','customers.edit','records.view','products.view','messaging.view','messaging.send','notifications.view','settings.view']],
];

$roleCount = 0;
foreach ($rolesDef as [$name, $slug, $desc, $isSystem, $permSlugs]) {
    $existing = $conn->fetchOne("SELECT id FROM roles WHERE slug = ?", [$slug]);
    if ($existing) continue;

    $roleId = uuid();
    $conn->insert('roles', ['id' => $roleId, 'name' => $name, 'slug' => $slug, 'description' => $desc, 'is_system' => $isSystem ? 'true' : 'false', 'is_active' => 'true', 'created_at' => now(), 'updated_at' => now()]);

    foreach ($permSlugs as $ps) {
        if (isset($permIds[$ps])) {
            $conn->insert('role_permissions', ['role_id' => $roleId, 'permission_id' => $permIds[$ps]]);
        }
    }
    $roleCount++;
}
echo "  Created {$roleCount} roles\n";

// ─── 3. Default Location ───
echo "[3/8] Seeding default location...\n";

$existingLoc = $conn->fetchOne("SELECT id FROM locations WHERE code = 'HQ'");
if (!$existingLoc) {
    $locId = uuid();
    $conn->insert('locations', ['id' => $locId, 'name' => 'Head Office', 'code' => 'HQ', 'type' => 'head_office', 'state' => 'Lagos', 'address' => 'Lagos, Nigeria', 'is_active' => 'true', 'created_at' => now(), 'updated_at' => now()]);
    echo "  Created Head Office location\n";
} else {
    echo "  Head Office already exists\n";
}

// ─── 4. System Settings ───
echo "[4/8] Seeding system settings...\n";

$settingsDef = [
    ['approval.default_mode', 'sequential', 'string', 'approval', 'Default approval workflow mode'],
    ['approval.conditional_routing_enabled', 'true', 'boolean', 'approval', 'Enable conditional approval routing'],
    ['approval.sla_tracking_enabled', 'true', 'boolean', 'approval', 'Enable SLA tracking'],
    ['approval.auto_escalation_enabled', 'false', 'boolean', 'approval', 'Enable auto-escalation on SLA breach'],
    ['security.maker_checker_disbursement', 'false', 'boolean', 'security', 'Require maker-checker for disbursement'],
    ['security.maker_checker_write_off', 'true', 'boolean', 'security', 'Require maker-checker for write-off'],
    ['security.maker_checker_reversal', 'true', 'boolean', 'security', 'Require maker-checker for journal reversals'],
    ['security.password_min_length', '8', 'integer', 'security', 'Minimum password length'],
    ['notification.email_enabled', 'true', 'boolean', 'notification', 'Enable email notifications'],
    ['notification.sms_enabled', 'true', 'boolean', 'notification', 'Enable SMS notifications'],
    ['notification.whatsapp_enabled', 'false', 'boolean', 'notification', 'Enable WhatsApp notifications'],
    ['penalty.overdue_check_enabled', 'true', 'boolean', 'penalty', 'Enable daily overdue check'],
    ['penalty.default_grace_days', '3', 'integer', 'penalty', 'Default grace period days'],
    ['penalty.payment_allocation_order', '["penalty","interest","principal"]', 'json', 'penalty', 'Payment allocation priority order'],
    ['general.date_format', 'Y-m-d', 'string', 'general', 'System date format'],
    ['general.currency', 'NGN', 'string', 'general', 'System currency'],
    ['general.currency_symbol', '₦', 'string', 'general', 'Currency symbol'],
    ['general.pagination_default', '20', 'integer', 'general', 'Default pagination per page'],
    ['general.max_upload_size_mb', '10', 'integer', 'general', 'Maximum file upload size in MB'],
    ['general.company_name', 'CreditX Financial Services', 'string', 'general', 'Company display name'],
    ['general.support_email', 'support@dostsuite.com', 'string', 'general', 'Support email address'],
    ['agent.monthly_target', '1000000', 'integer', 'general', 'Default monthly disbursement target (naira) for agents without an individual target set'],
];

$settingsCount = 0;
foreach ($settingsDef as [$key, $value, $type, $category, $desc]) {
    $existing = $conn->fetchOne("SELECT id FROM system_settings WHERE setting_key = ?", [$key]);
    if ($existing) continue;
    $conn->insert('system_settings', ['id' => uuid(), 'setting_key' => $key, 'setting_value' => $value, 'type' => $type, 'category' => $category, 'description' => $desc, 'is_encrypted' => 'false', 'created_at' => now(), 'updated_at' => now()]);
    $settingsCount++;
}
echo "  Created {$settingsCount} settings\n";

// ─── 5. Fee Types ───
echo "[5/8] Seeding fee types...\n";

$feeTypesDef = [
    ['Admin Fee', 'AA', 'Administrative fee charged on loan origination', true],
    ['Insurance Fee', 'IA', 'Insurance premium deducted at source', true],
    ['Management Fee', 'MFA', 'Management fee for loan servicing', true],
    ['Bank Statement Fee', 'BSA', 'Fee for bank statement processing', true],
    ['Processing Fee', 'PFI', 'General loan processing fee', true],
];

$feeCount = 0;
foreach ($feeTypesDef as [$name, $code, $desc, $isSystem]) {
    $existing = $conn->fetchOne("SELECT id FROM fee_types WHERE code = ?", [$code]);
    if ($existing) continue;
    $conn->insert('fee_types', ['id' => uuid(), 'name' => $name, 'code' => $code, 'description' => $desc, 'is_system' => $isSystem ? 'true' : 'false', 'is_active' => 'true', 'created_at' => now(), 'updated_at' => now()]);
    $feeCount++;
}
echo "  Created {$feeCount} fee types\n";

// ─── 6. Super Admin User ───
echo "[6/8] Seeding super admin user...\n";

$existingAdmin = $conn->fetchOne("SELECT id FROM users WHERE email = ?", ['admin@dostsuite.com']);
if (!$existingAdmin) {
    $adminId = uuid();
    $hash = password_hash('Admin@123456', PASSWORD_BCRYPT);
    $conn->insert('users', [
        'id' => $adminId, 'first_name' => 'System', 'last_name' => 'Administrator',
        'email' => 'admin@dostsuite.com', 'password_hash' => $hash,
        'phone' => '+2340000000000', 'status' => 'active',
        'created_at' => now(), 'updated_at' => now(),
    ]);

    // Assign super_admin role
    $saRoleId = $conn->fetchOne("SELECT id FROM roles WHERE slug = 'super_admin'");
    if ($saRoleId) {
        $conn->insert('user_roles', ['user_id' => $adminId, 'role_id' => $saRoleId]);
    }

    // Assign HQ location
    $hqId = $conn->fetchOne("SELECT id FROM locations WHERE code = 'HQ'");
    if ($hqId) {
        $conn->insert('user_locations', ['user_id' => $adminId, 'location_id' => $hqId]);
    }

    echo "  Created super admin: admin@dostsuite.com / Admin@123456\n";
} else {
    echo "  Super admin already exists\n";
}

// ─── 7. Record Types ───
echo "[7/8] Seeding record types...\n";

$rtDef = [
    ['IPPIS', 'IPPIS', 'Integrated Payroll and Personnel Information System'],
    ['TESCOM', 'TESCOM', 'Teaching Service Commission'],
    ['LASG', 'LASG', 'Lagos State Government'],
    ['SUBEB', 'SUBEB', 'State Universal Basic Education Board'],
];

$rtCount = 0;
foreach ($rtDef as [$name, $code, $desc]) {
    $existing = $conn->fetchOne("SELECT id FROM record_types WHERE code = ?", [$code]);
    if ($existing) continue;
    $conn->insert('record_types', ['id' => uuid(), 'name' => $name, 'code' => $code, 'description' => $desc, 'is_active' => 'true', 'created_at' => now(), 'updated_at' => now()]);
    $rtCount++;
}
echo "  Created {$rtCount} record types\n";

// ─── 8. Default GL Accounts ───
echo "[8/8] Seeding chart of accounts...\n";

$glDef = [
    ['Loan Receivable', '1001', 'LR', 'asset', 'general', 'Total loan portfolio receivable'],
    ['Customer Balance', '1002', 'CUBGL', 'asset', 'customer', 'Customer loan balance accounts'],
    ['Bank/Cash', '1003', 'BANK', 'asset', 'general', 'Bank and cash accounts'],
    ['Insurance Income', '4001', 'IA', 'income', 'general', 'Insurance fee income'],
    ['Admin Fee Income', '4002', 'AA', 'income', 'general', 'Administrative fee income'],
    ['Management Fee Income', '4003', 'MFA', 'income', 'general', 'Management fee income'],
    ['Bank Statement Fee Income', '4004', 'BSA', 'income', 'general', 'Bank statement fee income'],
    ['Interest Income', '4005', 'II', 'income', 'general', 'Loan interest income'],
    ['Penalty Income', '4006', 'PI', 'income', 'general', 'Late payment penalty income'],
    ['Top-Up Balance', '2001', 'TUGL', 'liability', 'general', 'Previous loan balance carried forward'],
    ['Bad Debt Expense', '5001', 'BDE', 'expense', 'general', 'Written-off loan expense'],
    ['Loan Loss Provision', '5002', 'LLP', 'expense', 'general', 'Monthly provisioning expense (per CBN prudential categories)'],
    ['Allowance for Loan Losses', '1099', 'ALLOW', 'asset', 'general', 'Contra-asset — cumulative loan loss allowance (CR-normal)'],
    ['Retained Earnings', '3001', 'RETEARN', 'equity', 'general', 'Accumulated net income from closed periods'],
    ['Processing Fee Income', '4007', 'PFI', 'income', 'general', 'Processing fee income'],
    ['Settlement Account', '1004', 'SETTLE', 'asset', 'general', 'Loan settlement disbursement account'],
];

$glCount = 0;
foreach ($glDef as [$name, $number, $code, $type, $ledgerType, $desc]) {
    $existing = $conn->fetchOne("SELECT id FROM general_ledgers WHERE account_code = ?", [$code]);
    if ($existing) continue;
    $conn->insert('general_ledgers', ['id' => uuid(), 'account_name' => $name, 'account_number' => $number, 'account_code' => $code, 'account_type' => $type, 'ledger_type' => $ledgerType, 'description' => $desc, 'is_active' => 'true', 'created_at' => now(), 'updated_at' => now()]);
    $glCount++;
}
echo "  Created {$glCount} GL accounts\n";

echo "\n=== All seeding complete ===\n";
echo "Memory used: " . round(memory_get_peak_usage(true) / 1024 / 1024, 1) . " MB\n";
