<?php

declare(strict_types=1);

/**
 * CreditX — Customer self-service portal auth schema init
 *
 * Adds the columns the customer portal needs to the customers table so an
 * existing (agent-captured) customer can become a self-service portal account:
 *
 *   - password_hash       VARCHAR(255)  NULL    Bcrypt hash (NULL = OTP-only)
 *   - is_portal_enabled   BOOLEAN       NOT NULL DEFAULT FALSE
 *   - portal_status       VARCHAR(20)   NULL    pending|active|suspended
 *   - email_verified_at   TIMESTAMP(0)  NULL    Email-verification time
 *   - last_login_at       TIMESTAMP(0)  NULL    Last portal login time
 *   - last_login_ip       VARCHAR(45)   NULL    Last portal login IP
 *
 * Run once per environment on deploy:
 *
 *   php bin/init-customer-portal-auth.php
 *
 * Idempotent — re-running finds the columns already exist and exits cleanly.
 * Uses information_schema.columns for the existence check.
 */

require __DIR__ . '/../vendor/autoload.php';

if (file_exists(__DIR__ . '/../.env')) {
    $dotenv = \Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
    $dotenv->load();
}

echo "=== CreditX Customer Portal Auth Schema Init ===\n\n";

$em = \App\Infrastructure\Persistence\DoctrineEntityManagerFactory::create();
$conn = $em->getConnection();

$columns = [
    'password_hash' => [
        'add_sql' => "ALTER TABLE customers ADD COLUMN password_hash VARCHAR(255) NULL",
        'purpose' => 'Bcrypt hash of the portal password (NULL = OTP-only login)',
    ],
    'is_portal_enabled' => [
        'add_sql' => "ALTER TABLE customers ADD COLUMN is_portal_enabled BOOLEAN NOT NULL DEFAULT FALSE",
        'purpose' => 'Whether self-service portal login is permitted',
    ],
    'portal_status' => [
        'add_sql' => "ALTER TABLE customers ADD COLUMN portal_status VARCHAR(20) NULL",
        'purpose' => 'Portal account lifecycle: pending|active|suspended',
    ],
    'email_verified_at' => [
        'add_sql' => "ALTER TABLE customers ADD COLUMN email_verified_at TIMESTAMP(0) WITHOUT TIME ZONE NULL",
        'purpose' => 'When the customer verified their email',
    ],
    'last_login_at' => [
        'add_sql' => "ALTER TABLE customers ADD COLUMN last_login_at TIMESTAMP(0) WITHOUT TIME ZONE NULL",
        'purpose' => 'Last successful portal login timestamp',
    ],
    'last_login_ip' => [
        'add_sql' => "ALTER TABLE customers ADD COLUMN last_login_ip VARCHAR(45) NULL",
        'purpose' => 'IP of the last successful portal login',
    ],
];

$addedCount = 0;
$skippedCount = 0;

foreach ($columns as $colName => $spec) {
    $exists = $conn->fetchOne(
        "SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'customers' AND column_name = :col
        )",
        ['col' => $colName],
    );

    if ($exists) {
        echo "✓ Column 'customers.{$colName}' already exists — skipping.\n";
        $skippedCount++;
        continue;
    }

    $conn->executeStatement($spec['add_sql']);
    echo "✓ Added column 'customers.{$colName}' — {$spec['purpose']}.\n";
    $addedCount++;
}

echo "\n";
echo "Summary: added {$addedCount}, skipped {$skippedCount}.\n";

if ($addedCount > 0) {
    echo "\nThe customer self-service portal is now able to register and authenticate customers.\n";
}
