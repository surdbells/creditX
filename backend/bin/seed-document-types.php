<?php

declare(strict_types=1);

/**
 * Seed the configurable loan document types. Idempotent — existing codes are
 * left untouched, so re-running never overrides an admin's required/active
 * choices.
 *
 * `is_required` drives the submit-for-approval gate (globally). The defaults
 * below mirror what agents actually upload today: ID Card, Payslip and Bank
 * Statement are required; Passport Photograph stays available but OPTIONAL, so
 * loans already captured without one are not blocked.
 *
 * Usage:
 *   php bin/seed-document-types.php            # dry-run preview
 *   php bin/seed-document-types.php --apply    # insert missing types
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
    'password' => $_ENV['DB_PASSWORD'] ?? '',
]);

$apply = in_array('--apply', $argv ?? [], true);

// code, label, is_required, accept, sort_order
$types = [
    ['passport',       'Passport Photograph',        false, 'image/*',      10],
    ['id_card',        'ID Card (NIN/Voter/Driver)', true,  'image/*,.pdf', 20],
    ['payslip',        'Recent Payslip',             true,  'image/*,.pdf', 30],
    ['bank_statement', 'Bank Statement',             true,  '.pdf,image/*', 40],
    ['utility_bill',   'Utility Bill',               false, 'image/*,.pdf', 50],
    ['work_id',        'Work ID',                    false, 'image/*,.pdf', 60],
    ['other',          'Other',                      false, '',             99],
];

$toInsert = [];
foreach ($types as $t) {
    $exists = $conn->fetchOne('SELECT id FROM document_types WHERE code = ?', [$t[0]]);
    if ($exists) {
        echo "  exists, skipping: {$t[0]}\n";
        continue;
    }
    $toInsert[] = $t;
}

if (empty($toInsert)) {
    echo "\nNothing to seed — all document types already present.\n";
    exit(0);
}

echo "\nWill insert " . count($toInsert) . " document type(s):\n";
foreach ($toInsert as [$code, $label, $required]) {
    echo '  + ' . str_pad($code, 16) . ' ' . str_pad($label, 30) . ($required ? 'REQUIRED' : 'optional') . "\n";
}

if (!$apply) {
    echo "\nDry-run. Re-run with --apply to insert.\n";
    exit(0);
}

$now = (new DateTimeImmutable())->format('Y-m-d H:i:s');
foreach ($toInsert as [$code, $label, $required, $accept, $order]) {
    $conn->insert('document_types', [
        'id'          => \Ramsey\Uuid\Uuid::uuid4()->toString(),
        'code'        => $code,
        'label'       => $label,
        'is_required' => $required ? 'true' : 'false',
        'is_active'   => 'true',
        'is_system'   => 'true',
        'accept'      => $accept,
        'sort_order'  => $order,
        'created_at'  => $now,
        'updated_at'  => $now,
    ]);
    echo "  inserted: {$code}\n";
}
echo "\nDone. Manage these under Settings → Document Types.\n";
