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
    'payments' => [
        ['payments.view', 'View Payments'],
        ['payments.create', 'Post Payments'],
        ['payments.bulk_upload', 'Bulk Upload Payments'],
    ],
    'reports' => [
        ['reports.portfolio', 'View Portfolio Reports'],
        ['reports.par', 'View PAR Reports'],
        ['reports.performance', 'View Performance Reports'],
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
echo "  Created {$permCount} permissions\n";

// ─── 2. Roles ───
echo "[2/5] Seeding roles...\n";

$rolesDef = [
    ['Super Admin', 'super_admin', 'Full system access', true, array_keys($permissionEntities)],
    ['Admin', 'admin', 'Administrative access', true, array_keys($permissionEntities)],
    ['Operations Head', 'operations_head', 'Head of operations — loan oversight', true, [
        'loans.view', 'loans.approve', 'loans.reject', 'loans.disburse', 'loans.close', 'loans.write_off', 'loans.restructure',
        'customers.view', 'records.view', 'products.view', 'accounting.view',
        'payments.view', 'reports.portfolio', 'reports.par', 'reports.performance', 'reports.cbn', 'reports.export',
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
        'payments.view', 'payments.create', 'payments.bulk_upload',
        'loans.view', 'customers.view',
        'reports.portfolio', 'reports.par', 'reports.performance', 'reports.cbn', 'reports.reconciliation', 'reports.export',
        'maker_checker.make', 'notifications.view',
    ]],
    ['Compliance Officer', 'compliance_officer', 'Regulatory compliance and reporting', true, [
        'loans.view', 'customers.view', 'accounting.view',
        'reports.portfolio', 'reports.par', 'reports.cbn', 'reports.export',
        'audit.view', 'notifications.view',
    ]],
    ['Agent', 'agent', 'Field agent — loan origination', true, [
        'loans.view', 'loans.create',
        'customers.view', 'customers.create', 'customers.edit',
        'records.view',
        'messaging.view', 'messaging.send', 'notifications.view',
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

    // Penalty settings
    ['penalty.default_grace_period_days', '5', SettingType::INTEGER, SettingCategory::PENALTY, 'Default grace period before penalty applies'],
    ['penalty.overdue_check_enabled', 'true', SettingType::BOOLEAN, SettingCategory::PENALTY, 'Enable daily overdue loan detection'],
    ['penalty.payment_allocation_order', '["penalty","interest","principal"]', SettingType::JSON, SettingCategory::PENALTY, 'Payment allocation priority order'],

    // Notification settings
    ['notification.email_enabled', 'true', SettingType::BOOLEAN, SettingCategory::NOTIFICATION, 'Enable email notifications'],
    ['notification.sms_enabled', 'true', SettingType::BOOLEAN, SettingCategory::NOTIFICATION, 'Enable SMS notifications'],
    ['notification.whatsapp_enabled', 'false', SettingType::BOOLEAN, SettingCategory::NOTIFICATION, 'Enable WhatsApp notifications'],

    // General settings
    ['general.company_name', 'CreditX', SettingType::STRING, SettingCategory::GENERAL, 'Company display name'],
    ['general.currency', 'NGN', SettingType::STRING, SettingCategory::GENERAL, 'Default currency code'],
    ['general.currency_symbol', '₦', SettingType::STRING, SettingCategory::GENERAL, 'Currency display symbol'],
    ['general.max_customer_age', '57', SettingType::INTEGER, SettingCategory::GENERAL, 'Maximum customer age for eligibility'],
    ['general.max_service_years', '33', SettingType::INTEGER, SettingCategory::GENERAL, 'Maximum years of service for eligibility'],
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
echo "  Created {$settingCount} settings\n";

// ─── 5. Super Admin User ───
echo "[5/5] Seeding super admin user...\n";

$existingAdmin = $em->getRepository(User::class)->findOneBy(['email' => 'admin@creditx.com']);
if ($existingAdmin === null) {
    $superAdminRole = $em->getRepository(Role::class)->findOneBy(['slug' => 'super_admin']);
    $hqLocation = $em->getRepository(Location::class)->findOneBy(['code' => 'HQ']);

    $admin = new User();
    $admin->setFirstName('System');
    $admin->setLastName('Administrator');
    $admin->setEmail('admin@creditx.com');
    $admin->setPasswordHash(PasswordService::hash('Admin@123456'));
    $admin->setPhone('+2340000000000');
    $admin->setStatus(UserStatus::ACTIVE);
    if ($superAdminRole) $admin->addRole($superAdminRole);
    if ($hqLocation) $admin->addLocation($hqLocation);
    $em->persist($admin);
    $em->flush();
    echo "  Created super admin: admin@creditx.com / Admin@123456\n";
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
echo "  Created {$ftCount} fee types\n";

echo "\n=== All seeding complete ===\n";
