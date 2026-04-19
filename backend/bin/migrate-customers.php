#!/usr/bin/env php
<?php

declare(strict_types=1);

/**
 * CreditX v2.0 — Customers Migration
 *
 * Migrates from legacy MySQL `customers` table to PostgreSQL `customers` + `next_of_kins`.
 *
 * The legacy customers table has NO name/phone/bank/email — those live on the
 * government record (ippis_tbl/tescom_tbl/etc.) joined via service_id = staff_id.
 * This script:
 *   1. Pulls each row from legacy customers
 *   2. Looks up the matching government_record (by service_id → staff_id)
 *   3. Creates a customer in creditx using record.employee_name, phone, bank, account
 *   4. Merges KYC fields (address, BVN, DOB, etc.) from both sources
 *   5. Creates a next_of_kin record from next_name/next_phone/next_address/next_relationship
 *
 * Usage:
 *   php bin/migrate-customers.php [--dry-run] [--limit=N]
 *
 * Prerequisites:
 *   - Government records already migrated (run migrate-legacy.php first)
 *   - LEGACY_DB_* vars set in .env
 *   - The script is idempotent: skips customers whose staff_id already exists
 */

require __DIR__ . '/../vendor/autoload.php';

$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
$dotenv->load();

$dryRun = in_array('--dry-run', $argv, true);
$limit = 0;
foreach ($argv as $arg) {
    if (preg_match('/^--limit=(\d+)$/', $arg, $m)) $limit = (int) $m[1];
}

echo "╔══════════════════════════════════════════════════════╗\n";
echo "║     CreditX v2.0 — Customers Migration              ║\n";
echo "╠══════════════════════════════════════════════════════╣\n";
echo "║  Source: MySQL (u931799113_ftipay.customers)         ║\n";
echo "║  Target: PostgreSQL (creditx.customers + nok)        ║\n";
if ($dryRun) echo "║  Mode: DRY RUN (no writes)                           ║\n";
if ($limit > 0) echo "║  Limit: {$limit} rows" . str_repeat(' ', max(0, 42 - strlen((string)$limit))) . "║\n";
echo "╚══════════════════════════════════════════════════════╝\n\n";

// ─── Connect to MySQL ───
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
    echo "[MySQL] FAILED: {$e->getMessage()}\n";
    exit(1);
}

// ─── Connect to PostgreSQL ───
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
    echo "[PgSQL] FAILED: {$e->getMessage()}\n";
    exit(1);
}

// ─── Helpers ───
function uuid(): string { return \Ramsey\Uuid\Uuid::uuid4()->toString(); }
function now(): string { return (new DateTimeImmutable('now', new DateTimeZone('Africa/Lagos')))->format('Y-m-d H:i:s'); }
function cleanStr(?string $v): ?string {
    if ($v === null) return null;
    $v = trim($v);
    return ($v === '' || strtolower($v) === 'null' || $v === '0') ? null : $v;
}
function cleanInt(?string $v): ?int {
    $v = cleanStr($v);
    if ($v === null) return null;
    return is_numeric($v) ? (int) $v : null;
}
function cleanBvn(?string $v): ?string {
    $v = cleanStr($v);
    if ($v === null) return null;
    $d = preg_replace('/\D/', '', $v);
    return (strlen($d) === 11) ? $d : null; // Nigerian BVN is 11 digits
}
function cleanPhone(?string $v): ?string {
    $v = cleanStr($v);
    if ($v === null) return null;
    $d = preg_replace('/\D/', '', $v);
    // Normalize to 0XXXXXXXXXX format
    if (strlen($d) === 10) $d = '0' . $d;
    if (strlen($d) === 13 && str_starts_with($d, '234')) $d = '0' . substr($d, 3);
    return strlen($d) === 11 ? $d : $v;
}

// ─── Load government records map (staff_id → record) ───
echo "[1/3] Loading government records for lookup...\n";
$records = [];
$rstmt = $pg->query("SELECT id, staff_id, employee_name, telephone_number, bank_name, account_number,
                            date_of_birth, gender, marital_status
                     FROM government_records WHERE is_active = true");
while ($r = $rstmt->fetch()) {
    $sid = strtoupper(trim($r['staff_id']));
    $records[$sid] = $r;
}
echo "  Loaded " . count($records) . " active government records\n\n";

// ─── Load existing customers (idempotency) ───
$existing = [];
$estmt = $pg->query("SELECT staff_id FROM customers WHERE staff_id IS NOT NULL");
while ($r = $estmt->fetch()) { $existing[strtoupper(trim($r['staff_id']))] = true; }
echo "  " . count($existing) . " customers already in target\n\n";

// ─── Process legacy customers ───
echo "[2/3] Fetching legacy customers...\n";
$sql = "SELECT * FROM customers ORDER BY customer_id";
if ($limit > 0) $sql .= " LIMIT {$limit}";
$stmt = $mysql->query($sql);
$legacy = $stmt->fetchAll();
echo "  Found " . count($legacy) . " legacy customer rows\n\n";

echo "[3/3] Migrating customers...\n";
$stats = ['created' => 0, 'skipped_exists' => 0, 'no_record' => 0, 'errors' => 0, 'nok_created' => 0];
$noRecordList = [];

$insertCustomer = $pg->prepare(
    "INSERT INTO customers (
        id, staff_id, full_name, phone, alt_phone, email,
        date_of_birth, gender, marital_status,
        home_address, permanent_address, state_of_origin, lga, hometown,
        mothers_maiden_name, religion, bvn, number_of_children,
        bank_name, account_number, alt_bank_name, alt_account_number,
        created_at, updated_at
    ) VALUES (
        :id, :staff_id, :full_name, :phone, :alt_phone, :email,
        :dob, :gender, :marital,
        :home_addr, :perm_addr, :state, :lga, :hometown,
        :mothers, :religion, :bvn, :number_of_children,
        :bank, :account, :alt_bank, :alt_account,
        :created_at, :updated_at
    )"
);

$insertNok = $pg->prepare(
    "INSERT INTO next_of_kins (id, customer_id, full_name, phone, address, relationship, is_primary, created_at, updated_at)
     VALUES (:id, :customer_id, :full_name, :phone, :address, :relationship, :is_primary, :created_at, :updated_at)"
);

foreach ($legacy as $idx => $row) {
    $serviceId = strtoupper(trim($row['service_id'] ?? ''));
    if ($serviceId === '') {
        $stats['errors']++;
        continue;
    }

    // Skip if already migrated
    if (isset($existing[$serviceId])) {
        $stats['skipped_exists']++;
        continue;
    }

    // Find matching government record
    $gov = $records[$serviceId] ?? null;
    if ($gov === null) {
        $stats['no_record']++;
        if (count($noRecordList) < 20) $noRecordList[] = $serviceId;
        continue;
    }

    // Build customer from gov record + legacy kyc fields
    $customerId = uuid();
    $now = now();
    $fullName = cleanStr($gov['employee_name']) ?? 'Unknown';

    try {
        if (!$dryRun) {
            $insertCustomer->execute([
                ':id' => $customerId,
                ':staff_id' => $gov['staff_id'],
                ':full_name' => $fullName,
                ':phone' => cleanPhone($gov['telephone_number']),
                ':alt_phone' => cleanPhone($row['alternative_phone'] ?? null),
                ':email' => null, // Not in legacy
                ':dob' => cleanStr($gov['date_of_birth']),
                ':gender' => cleanStr($gov['gender']),
                ':marital' => cleanStr($gov['marital_status']),
                ':home_addr' => cleanStr($row['home_address'] ?? null),
                ':perm_addr' => cleanStr($row['permanent_address'] ?? null),
                ':state' => cleanStr($row['state_origin'] ?? null),
                ':lga' => cleanStr($row['local_government'] ?? null),
                ':hometown' => cleanStr($row['home_town'] ?? null),
                ':mothers' => cleanStr($row['mothers_maiden'] ?? null),
                ':religion' => cleanStr($row['religion'] ?? null),
                ':bvn' => cleanBvn($row['bvn_number'] ?? null),
                ':number_of_children' => cleanInt($row['number_children'] ?? null),
                ':bank' => cleanStr($gov['bank_name']),
                ':account' => cleanStr($gov['account_number']),
                ':alt_bank' => cleanStr($row['alternate_bank'] ?? null),
                ':alt_account' => cleanStr($row['alternate_account'] ?? null),
                ':created_at' => $now,
                ':updated_at' => $now,
            ]);
        }
        $stats['created']++;
        $existing[$serviceId] = true;

        // Create next of kin if present
        $nokName = cleanStr($row['next_name'] ?? null);
        if ($nokName !== null && !$dryRun) {
            $insertNok->execute([
                ':id' => uuid(),
                ':customer_id' => $customerId,
                ':full_name' => $nokName,
                ':phone' => cleanPhone($row['next_phone'] ?? null),
                ':address' => cleanStr($row['next_address'] ?? null),
                ':relationship' => cleanStr($row['next_relationship'] ?? null),
                ':is_primary' => 'true',
                ':created_at' => $now,
                ':updated_at' => $now,
            ]);
            $stats['nok_created']++;
        } elseif ($nokName !== null) {
            $stats['nok_created']++; // count in dry-run
        }

        if (($idx + 1) % 100 === 0) echo "  Processed " . ($idx + 1) . "/" . count($legacy) . "...\n";
    } catch (\Throwable $e) {
        $stats['errors']++;
        echo "  ERROR on service_id {$serviceId}: {$e->getMessage()}\n";
    }
}

echo "\n╔══════════════════════════════════════════════════════╗\n";
echo "║                   Migration Summary                  ║\n";
echo "╠══════════════════════════════════════════════════════╣\n";
printf("║  Legacy rows:        %-32d║\n", count($legacy));
printf("║  Customers created:  %-32d║\n", $stats['created']);
printf("║  NOKs created:       %-32d║\n", $stats['nok_created']);
printf("║  Skipped (existed):  %-32d║\n", $stats['skipped_exists']);
printf("║  No gov record:      %-32d║\n", $stats['no_record']);
printf("║  Errors:             %-32d║\n", $stats['errors']);
echo "╚══════════════════════════════════════════════════════╝\n";

if (count($noRecordList) > 0) {
    echo "\nSample service_ids with no matching government record (first 20):\n";
    foreach ($noRecordList as $sid) echo "  - {$sid}\n";
    echo "\nTip: Ensure government records are migrated first (run migrate-legacy.php).\n";
}

if ($dryRun) echo "\n[DRY RUN] No data was written to the database.\n";
echo "\nDone.\n";
