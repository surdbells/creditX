#!/usr/bin/env php
<?php

declare(strict_types=1);

/**
 * CreditX v2.0 — Data Migration Script
 * 
 * Migrates from MySQL (u931799113_ftipay) to PostgreSQL (creditx):
 *   - ippis_tbl    → government_records (record_type: IPPIS)
 *   - tescom_tbl   → government_records (record_type: TESCOM)
 *   - lasg_tbl     → government_records (record_type: LASG)
 *   - subeb_tbl    → government_records (record_type: SUBEB)
 *   - user         → users (with role mapping)
 *
 * Usage:
 *   php bin/migrate-legacy.php [--dry-run] [--skip-records] [--skip-users]
 *
 * Prerequisites:
 *   - MySQL source database accessible
 *   - PostgreSQL target with schema created (orm:schema-tool:create)
 *   - Seed data loaded (seed-lite.php) — needs record_types + roles
 *   - Set LEGACY_DB_* vars in .env
 */

require __DIR__ . '/../vendor/autoload.php';

$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
$dotenv->load();

// ─── CLI Arguments ───
$dryRun     = in_array('--dry-run', $argv, true);
$skipRecords = in_array('--skip-records', $argv, true);
$skipUsers   = in_array('--skip-users', $argv, true);

echo "╔══════════════════════════════════════════════════════╗\n";
echo "║     CreditX v2.0 — Legacy Data Migration            ║\n";
echo "╠══════════════════════════════════════════════════════╣\n";
echo "║  Source: MySQL  (u931799113_ftipay)                  ║\n";
echo "║  Target: PostgreSQL (creditx)                       ║\n";
if ($dryRun) echo "║  MODE: DRY RUN (no data will be written)             ║\n";
echo "╚══════════════════════════════════════════════════════╝\n\n";

// ─── Connect to source MySQL ───
$mysqlHost = $_ENV['LEGACY_DB_HOST'] ?? '127.0.0.1';
$mysqlPort = $_ENV['LEGACY_DB_PORT'] ?? '3306';
$mysqlDb   = $_ENV['LEGACY_DB_NAME'] ?? 'u931799113_ftipay';
$mysqlUser = $_ENV['LEGACY_DB_USER'] ?? 'root';
$mysqlPass = $_ENV['LEGACY_DB_PASSWORD'] ?? '';

echo "[MySQL] Connecting to {$mysqlUser}@{$mysqlHost}:{$mysqlPort}/{$mysqlDb}...\n";

try {
    $mysql = new PDO(
        "mysql:host={$mysqlHost};port={$mysqlPort};dbname={$mysqlDb};charset=utf8mb4",
        $mysqlUser, $mysqlPass,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
    );
    echo "[MySQL] Connected OK\n";
} catch (PDOException $e) {
    echo "[MySQL] FAILED: " . $e->getMessage() . "\n";
    echo "\nSet these in backend/.env:\n";
    echo "  LEGACY_DB_HOST=127.0.0.1\n";
    echo "  LEGACY_DB_PORT=3306\n";
    echo "  LEGACY_DB_NAME=u931799113_ftipay\n";
    echo "  LEGACY_DB_USER=root\n";
    echo "  LEGACY_DB_PASSWORD=yourpassword\n";
    exit(1);
}

// ─── Connect to target PostgreSQL ───
$pgHost = $_ENV['DB_HOST'] ?? '127.0.0.1';
$pgPort = $_ENV['DB_PORT'] ?? '5432';
$pgDb   = $_ENV['DB_NAME'] ?? 'creditx';
$pgUser = $_ENV['DB_USER'] ?? 'creditx_user';
$pgPass = $_ENV['DB_PASSWORD'] ?? '';

echo "[PgSQL] Connecting to {$pgUser}@{$pgHost}:{$pgPort}/{$pgDb}...\n";

try {
    $pg = new PDO(
        "pgsql:host={$pgHost};port={$pgPort};dbname={$pgDb}",
        $pgUser, $pgPass,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
    );
    echo "[PgSQL] Connected OK\n\n";
} catch (PDOException $e) {
    echo "[PgSQL] FAILED: " . $e->getMessage() . "\n";
    exit(1);
}

function uuid(): string { return \Ramsey\Uuid\Uuid::uuid4()->toString(); }
function now(): string { return (new DateTimeImmutable('now', new DateTimeZone('Africa/Lagos')))->format('Y-m-d H:i:s'); }
function cleanStr(?string $v): ?string { return $v !== null ? trim($v) : null; }
function cleanDate(?string $v): ?string {
    if ($v === null || $v === '' || $v === '0000-00-00 00:00:00') return null;
    try { return (new DateTimeImmutable($v))->format('Y-m-d'); }
    catch (\Exception $e) { return null; }
}
function cleanNum(?string $v): ?string {
    if ($v === null || $v === '') return null;
    $n = preg_replace('/[^0-9.]/', '', $v);
    return $n !== '' ? number_format((float)$n, 2, '.', '') : null;
}

$stats = ['ippis' => 0, 'tescom' => 0, 'lasg' => 0, 'subeb' => 0, 'users' => 0, 'skipped' => 0, 'errors' => 0];

// ─── PART 1: Migrate Government Records ───
if (!$skipRecords) {
    echo "═══════════════════════════════════════════\n";
    echo " PART 1: Government Records Migration\n";
    echo "═══════════════════════════════════════════\n\n";

    // Get record type IDs from PostgreSQL
    $rtStmt = $pg->query("SELECT id, code FROM record_types");
    $recordTypes = [];
    while ($row = $rtStmt->fetch()) {
        $recordTypes[$row['code']] = $row['id'];
    }

    if (empty($recordTypes)) {
        echo "ERROR: No record types found in PostgreSQL. Run seed-lite.php first.\n";
        exit(1);
    }
    echo "Record types found: " . implode(', ', array_keys($recordTypes)) . "\n\n";

    // Prepare insert statement
    $insertSql = "INSERT INTO government_records (
        id, record_type_id, staff_id, employee_name, hire_date, date_of_birth,
        marital_status, gender, job_title, location, organization, sub_organization,
        telephone_number, bank_name, account_number, gross_pay, department,
        grade_level, step, net_pay, pension_number, state_of_origin, lga,
        ministry, is_active, created_at, updated_at
    ) VALUES (
        :id, :record_type_id, :staff_id, :employee_name, :hire_date, :date_of_birth,
        :marital_status, :gender, :job_title, :location, :organization, :sub_organization,
        :telephone_number, :bank_name, :account_number, :gross_pay, :department,
        :grade_level, :step, :net_pay, :pension_number, :state_of_origin, :lga,
        :ministry, :is_active, :created_at, :updated_at
    ) ON CONFLICT (record_type_id, staff_id) DO NOTHING";

    $insertStmt = $dryRun ? null : $pg->prepare($insertSql);

    // ─── Source table definitions (MySQL column → target field mapping) ───
    $tables = [
        [
            'source' => 'ippis_tbl', 'code' => 'IPPIS', 'key' => 'ippis',
            'map' => [
                'Staff_ID' => 'staff_id', 'Employee_Name' => 'employee_name',
                'Hire_Date' => 'hire_date', 'Date_Of_Birth' => 'date_of_birth',
                'Marital_Status' => 'marital_status', 'Gender' => 'gender',
                'Job_Title' => 'job_title', 'Location' => 'location',
                'Organization' => 'organization', 'Sub_Organization' => 'sub_organization',
                'Telephone_Number' => 'telephone_number', 'Bank_Name' => 'bank_name',
                'Account_Number' => 'account_number', 'Gross_pay' => 'gross_pay',
                'Department' => 'department', 'Grade' => 'grade_level',
                'Step' => 'step', 'Salary' => 'net_pay',
                'PFA_Name' => 'pension_number', 'State_Of_Origin' => 'state_of_origin',
                'Lga_Of_Origin' => 'lga',
            ],
        ],
        [
            'source' => 'tescom_tbl', 'code' => 'TESCOM', 'key' => 'tescom',
            'map' => [
                'Staff_ID' => 'staff_id', 'Employee_Name' => 'employee_name',
                'Hire_Date' => 'hire_date', 'Date_Of_Birth' => 'date_of_birth',
                'Marital_Status' => 'marital_status', 'Gender' => 'gender',
                'Job_Title' => 'job_title', 'Location' => 'location',
                'Organization' => 'organization', 'Sub_Organization' => 'sub_organization',
                'Telephone_Number' => 'telephone_number', 'Bank_Name' => 'bank_name',
                'Account_Number' => 'account_number', 'Gross_pay' => 'gross_pay',
                'Department' => 'department', 'Grade' => 'grade_level',
                'Step' => 'step', 'Salary' => 'net_pay',
                'PFA_Name' => 'pension_number', 'State_Of_Origin' => 'state_of_origin',
                'Lga_Of_Origin' => 'lga',
            ],
        ],
        [
            'source' => 'lasg_tbl', 'code' => 'LASG', 'key' => 'lasg',
            'map' => [
                'Staff_ID' => 'staff_id', 'Employee_Name' => 'employee_name',
                'Hire_Date' => 'hire_date', 'Date_Of_Birth' => 'date_of_birth',
                'Marital_Status' => 'marital_status', 'Gender' => 'gender',
                'Job_Title' => 'job_title', 'Location' => 'location',
                'Organization' => 'organization', 'Sub_Organization' => 'sub_organization',
                'Telephone_Number' => 'telephone_number', 'Bank_Name' => 'bank_name',
                'Account_Number' => 'account_number', 'Gross_pay' => 'gross_pay',
                'Grade' => 'grade_level', 'Step' => 'step',
                'Salary' => 'net_pay',
            ],
        ],
        [
            'source' => 'subeb_tbl', 'code' => 'SUBEB', 'key' => 'subeb',
            'map' => [
                'Staff_ID' => 'staff_id', 'Employee_Name' => 'employee_name',
                'Hire_Date' => 'hire_date', 'Date_Of_Birth' => 'date_of_birth',
                'Marital_Status' => 'marital_status', 'Gender' => 'gender',
                'Job_Title' => 'job_title', 'Location' => 'location',
                'Organization' => 'organization', 'Sub_Organization' => 'sub_organization',
                'Telephone_Number' => 'telephone_number', 'Bank_Name' => 'bank_name',
                'Account_Number' => 'account_number', 'Gross_pay' => 'gross_pay',
                'Department' => 'department', 'Grade' => 'grade_level',
                'Step' => 'step', 'Salary' => 'net_pay',
                'PFA_Name' => 'pension_number', 'State_Of_Origin' => 'state_of_origin',
                'Lga_Of_Origin' => 'lga',
            ],
        ],
    ];

    $dateFields = ['hire_date', 'date_of_birth'];
    $numFields  = ['gross_pay', 'net_pay'];
    $nowStr = now();
    $batchSize = 500;

    foreach ($tables as $tbl) {
        $source = $tbl['source'];
        $code   = $tbl['code'];
        $key    = $tbl['key'];
        $map    = $tbl['map'];
        $rtId   = $recordTypes[$code] ?? null;

        if ($rtId === null) {
            echo "  WARNING: Record type '{$code}' not found — skipping {$source}\n";
            continue;
        }

        // Count source rows
        $countStmt = $mysql->query("SELECT COUNT(*) as cnt FROM `{$source}`");
        $totalRows = (int) $countStmt->fetch()['cnt'];
        echo "  [{$code}] {$source}: {$totalRows} rows to migrate\n";

        if ($totalRows === 0) continue;

        // Fetch all
        $srcStmt = $mysql->query("SELECT * FROM `{$source}` ORDER BY `ID` ASC");
        $migrated = 0;
        $skipped  = 0;

        if (!$dryRun) $pg->beginTransaction();

        while ($row = $srcStmt->fetch()) {
            $staffId = cleanStr($row['Staff_ID'] ?? null);
            if ($staffId === null || $staffId === '') { $skipped++; continue; }

            $params = [
                ':id'               => uuid(),
                ':record_type_id'   => $rtId,
                ':staff_id'         => $staffId,
                ':employee_name'    => cleanStr($row['Employee_Name'] ?? null) ?: 'Unknown',
                ':hire_date'        => cleanDate($row['Hire_Date'] ?? null),
                ':date_of_birth'    => cleanDate($row['Date_Of_Birth'] ?? null),
                ':marital_status'   => cleanStr($row['Marital_Status'] ?? null),
                ':gender'           => cleanStr($row['Gender'] ?? null),
                ':job_title'        => cleanStr($row['Job_Title'] ?? null),
                ':location'         => cleanStr($row['Location'] ?? null),
                ':organization'     => cleanStr($row['Organization'] ?? null),
                ':sub_organization' => cleanStr($row['Sub_Organization'] ?? null),
                ':telephone_number' => cleanStr($row['Telephone_Number'] ?? null),
                ':bank_name'        => cleanStr($row['Bank_Name'] ?? null),
                ':account_number'   => cleanStr($row['Account_Number'] ?? null),
                ':gross_pay'        => cleanNum((string)($row['Gross_pay'] ?? '')),
                ':department'       => cleanStr($row['Department'] ?? null),
                ':grade_level'      => cleanStr($row['Grade'] ?? null),
                ':step'             => $row['Step'] !== null ? (string)(int)$row['Step'] : null,
                ':net_pay'          => cleanNum((string)($row['Salary'] ?? $row['Net_Pay'] ?? '')),
                ':pension_number'   => cleanStr($row['PFA_Name'] ?? null),
                ':state_of_origin'  => cleanStr($row['State_Of_Origin'] ?? null),
                ':lga'              => cleanStr($row['Lga_Of_Origin'] ?? null),
                ':ministry'         => null,
                ':is_active'        => 'true',
                ':created_at'       => $nowStr,
                ':updated_at'       => $nowStr,
            ];

            try {
                if (!$dryRun) $insertStmt->execute($params);
                $migrated++;
            } catch (PDOException $e) {
                if (str_contains($e->getMessage(), 'unique') || str_contains($e->getMessage(), 'duplicate')) {
                    $skipped++;
                } else {
                    echo "    ERROR [{$code}] Staff {$staffId}: " . $e->getMessage() . "\n";
                    $stats['errors']++;
                }
            }

            // Progress
            if ($migrated % 5000 === 0 && $migrated > 0) {
                echo "    Progress: {$migrated}/{$totalRows}\n";
            }
        }

        if (!$dryRun) $pg->commit();

        $stats[$key] = $migrated;
        $stats['skipped'] += $skipped;
        echo "    Done: {$migrated} migrated, {$skipped} skipped (empty/duplicate)\n\n";
    }
}

// ─── PART 2: Migrate Users ───
if (!$skipUsers) {
    echo "═══════════════════════════════════════════\n";
    echo " PART 2: User Migration\n";
    echo "═══════════════════════════════════════════\n\n";

    // Get role IDs from PostgreSQL
    $roleStmt = $pg->query("SELECT id, slug FROM roles");
    $roles = [];
    while ($row = $roleStmt->fetch()) {
        $roles[$row['slug']] = $row['id'];
    }

    // Map old role names to new role slugs
    $roleMap = [
        'super_admin'      => 'super_admin',
        'Super Admin'      => 'super_admin',
        'admin'            => 'admin',
        'Admin'            => 'admin',
        'Administrator'    => 'admin',
        'operations_head'  => 'operations_head',
        'Operations'       => 'operations_head',
        'Operations Head'  => 'operations_head',
        'underwriter'      => 'underwriter',
        'Underwriter'      => 'underwriter',
        'loan_officer'     => 'loan_officer',
        'Loan Officer'     => 'loan_officer',
        'accountant'       => 'accountant',
        'Accountant'       => 'accountant',
        'Accounts'         => 'accountant',
        'compliance'       => 'compliance_officer',
        'Compliance'       => 'compliance_officer',
        'agent'            => 'agent',
        'Agent'            => 'agent',
        'DSA'              => 'agent',
        'dsa'              => 'agent',
        'Field Agent'      => 'agent',
        'Staff'            => 'agent',
        'staff'            => 'agent',
    ];

    // Count source users
    $countStmt = $mysql->query("SELECT COUNT(*) as cnt FROM `user`");
    $totalUsers = (int) $countStmt->fetch()['cnt'];
    echo "  Source users: {$totalUsers}\n";

    // Prepare insert
    $userInsertSql = "INSERT INTO users (
        id, first_name, last_name, email, password_hash, phone, status,
        created_at, updated_at
    ) VALUES (
        :id, :first_name, :last_name, :email, :password_hash, :phone, :status,
        :created_at, :updated_at
    ) ON CONFLICT (email) DO NOTHING";

    $userInsertStmt = $dryRun ? null : $pg->prepare($userInsertSql);

    $roleAssignSql = "INSERT INTO user_roles (user_id, role_id) VALUES (:user_id, :role_id) ON CONFLICT DO NOTHING";
    $roleAssignStmt = $dryRun ? null : $pg->prepare($roleAssignSql);

    // Fetch all users
    $srcUsers = $mysql->query("SELECT * FROM `user` ORDER BY `user_id` ASC");
    $migrated = 0;
    $skipped  = 0;
    $nowStr = now();

    while ($row = $srcUsers->fetch()) {
        $email = strtolower(trim($row['email_address'] ?? ''));
        if ($email === '') { $skipped++; continue; }

        $firstName = cleanStr($row['first_name'] ?? '') ?: 'Unknown';
        $lastName  = cleanStr($row['last_name'] ?? '') ?: 'User';

        // Map status
        $oldStatus = strtolower(trim($row['user_status'] ?? 'active'));
        $newStatus = match(true) {
            str_contains($oldStatus, 'active')    => 'active',
            str_contains($oldStatus, 'inactive')  => 'inactive',
            str_contains($oldStatus, 'suspend')   => 'suspended',
            str_contains($oldStatus, 'disabled')  => 'inactive',
            default => 'active',
        };

        // Password: keep original bcrypt hash if it looks like one, otherwise hash a default
        $oldPass = $row['user_password'] ?? '';
        if (str_starts_with($oldPass, '$2y$') || str_starts_with($oldPass, '$2a$') || str_starts_with($oldPass, '$2b$')) {
            $passwordHash = $oldPass;
        } else {
            // MD5 or plaintext — re-hash with bcrypt
            $passwordHash = password_hash('ChangeMe@123', PASSWORD_BCRYPT);
        }

        $userId = uuid();

        $params = [
            ':id'            => $userId,
            ':first_name'    => $firstName,
            ':last_name'     => $lastName,
            ':email'         => $email,
            ':password_hash' => $passwordHash,
            ':phone'         => null,
            ':status'        => $newStatus,
            ':created_at'    => $nowStr,
            ':updated_at'    => $nowStr,
        ];

        try {
            if (!$dryRun) {
                $pg->beginTransaction();
                $userInsertStmt->execute($params);

                // Assign role
                $oldRole = trim($row['user_role'] ?? 'agent');
                $newRoleSlug = $roleMap[$oldRole] ?? 'agent';
                $roleId = $roles[$newRoleSlug] ?? $roles['agent'] ?? null;

                if ($roleId) {
                    $roleAssignStmt->execute([':user_id' => $userId, ':role_id' => $roleId]);
                }
                $pg->commit();
            }
            $migrated++;
        } catch (PDOException $e) {
            if (!$dryRun) { try { $pg->rollBack(); } catch (\Exception $ex) {} }
            if (str_contains($e->getMessage(), 'unique') || str_contains($e->getMessage(), 'duplicate')) {
                $skipped++;
            } else {
                echo "    ERROR [User] {$email}: " . $e->getMessage() . "\n";
                $stats['errors']++;
            }
        }
    }

    $stats['users'] = $migrated;
    $stats['skipped'] += $skipped;
    echo "  Done: {$migrated} users migrated, {$skipped} skipped (empty/duplicate)\n";
    echo "  NOTE: Users with non-bcrypt passwords get default: ChangeMe@123\n\n";
}

// ─── PART 3: Verification ───
echo "═══════════════════════════════════════════\n";
echo " VERIFICATION REPORT\n";
echo "═══════════════════════════════════════════\n\n";

// Source counts
$srcCounts = [];
foreach (['ippis_tbl', 'tescom_tbl', 'lasg_tbl', 'subeb_tbl', 'user'] as $tbl) {
    $stmt = $mysql->query("SELECT COUNT(*) as cnt FROM `{$tbl}`");
    $srcCounts[$tbl] = (int)$stmt->fetch()['cnt'];
}

// Target counts
$tgtRecords = (int) $pg->query("SELECT COUNT(*) FROM government_records")->fetchColumn();
$tgtUsers   = (int) $pg->query("SELECT COUNT(*) FROM users")->fetchColumn();

$tgtByType = [];
$stmt = $pg->query("SELECT rt.code, COUNT(gr.id) as cnt FROM government_records gr JOIN record_types rt ON gr.record_type_id = rt.id GROUP BY rt.code");
while ($row = $stmt->fetch()) {
    $tgtByType[$row['code']] = (int)$row['cnt'];
}

echo sprintf("  %-20s  %8s  %8s  %s\n", 'Source Table', 'Source', 'Target', 'Status');
echo "  " . str_repeat('─', 55) . "\n";
echo sprintf("  %-20s  %8d  %8d  %s\n", 'ippis_tbl → IPPIS',   $srcCounts['ippis_tbl'],   $tgtByType['IPPIS'] ?? 0,   ($tgtByType['IPPIS'] ?? 0) > 0 ? '✓' : '✗');
echo sprintf("  %-20s  %8d  %8d  %s\n", 'tescom_tbl → TESCOM', $srcCounts['tescom_tbl'],  $tgtByType['TESCOM'] ?? 0,  ($tgtByType['TESCOM'] ?? 0) > 0 ? '✓' : '✗');
echo sprintf("  %-20s  %8d  %8d  %s\n", 'lasg_tbl → LASG',     $srcCounts['lasg_tbl'],    $tgtByType['LASG'] ?? 0,    ($tgtByType['LASG'] ?? 0) > 0 ? '✓' : '✗');
echo sprintf("  %-20s  %8d  %8d  %s\n", 'subeb_tbl → SUBEB',   $srcCounts['subeb_tbl'],   $tgtByType['SUBEB'] ?? 0,   ($tgtByType['SUBEB'] ?? 0) > 0 ? '✓' : '✗');
echo sprintf("  %-20s  %8d  %8d  %s\n", 'user → users',        $srcCounts['user'],        $tgtUsers,                  $tgtUsers > 0 ? '✓' : '✗');
echo "  " . str_repeat('─', 55) . "\n";
echo sprintf("  %-20s  %8d  %8d\n", 'TOTAL RECORDS', array_sum($srcCounts) - $srcCounts['user'], $tgtRecords);
echo sprintf("  %-20s  %8d  %8d\n", 'TOTAL USERS',   $srcCounts['user'], $tgtUsers);

echo "\n\n";
echo "═══════════════════════════════════════════\n";
echo " MIGRATION SUMMARY\n";
echo "═══════════════════════════════════════════\n\n";
echo "  IPPIS:   {$stats['ippis']} records\n";
echo "  TESCOM:  {$stats['tescom']} records\n";
echo "  LASG:    {$stats['lasg']} records\n";
echo "  SUBEB:   {$stats['subeb']} records\n";
echo "  Users:   {$stats['users']} users\n";
echo "  Skipped: {$stats['skipped']} (empty staff_id / duplicates)\n";
echo "  Errors:  {$stats['errors']}\n";
echo "  Mode:    " . ($dryRun ? 'DRY RUN' : 'LIVE') . "\n";
echo "\n  Peak memory: " . round(memory_get_peak_usage(true) / 1024 / 1024, 1) . " MB\n";
echo "\n═══════════════════════════════════════════\n";
