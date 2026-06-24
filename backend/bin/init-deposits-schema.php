<?php

declare(strict_types=1);

/**
 * CreditX — Phase 2: deposit-taking schema initialiser.
 *
 * Creates the three deposit tables and tightens the Customer Deposits GL
 * so the books stay consistent. Run once on deploy:
 *
 *   php bin/init-deposits-schema.php
 *
 * Idempotent — every step checks existence first, so re-running is a no-op.
 *
 * Tables (mirror the Doctrine-mapped entities, UnderscoreNamingStrategy):
 *   - deposit_products      product templates (interest method/rate,
 *                           withdrawal policy, balance floors)
 *   - deposit_accounts      per-customer accounts (subsidiary ledger behind
 *                           the CUSTDEP control GL); carries running balance
 *   - deposit_transactions  statement lines, each tied to a JournalEntry
 *
 * Also: forces general_ledgers.CUSTDEP to ledger_type='general'. CUSTDEP is
 * a control account whose subsidiary ledger is deposit_accounts — NOT a
 * CUSTOMER-type GL (those expect a customer_ledger_id on every line, which
 * deposit postings don't carry). Leaving it CUSTOMER would make the
 * accounting healthcheck's sub-ledger integrity check flag every deposit
 * posting as an orphan line.
 */

require __DIR__ . '/../vendor/autoload.php';

if (file_exists(__DIR__ . '/../.env')) {
    $dotenv = \Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
    $dotenv->load();
}

echo "=== CreditX Deposits Schema Init ===\n\n";

$em = \App\Infrastructure\Persistence\DoctrineEntityManagerFactory::create();
$conn = $em->getConnection();

$tableExists = static function (string $name) use ($conn): bool {
    return (bool) $conn->fetchOne(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = :t)",
        ['t' => $name]
    );
};

// ─── 1. deposit_products ─────────────────────────────────────────────
if ($tableExists('deposit_products')) {
    echo "✓ Table 'deposit_products' already exists.\n";
} else {
    $conn->executeStatement("
        CREATE TABLE deposit_products (
            id VARCHAR(36) NOT NULL PRIMARY KEY,
            name VARCHAR(150) NOT NULL,
            code VARCHAR(30) NOT NULL,
            description TEXT NULL,
            interest_method VARCHAR(30) NOT NULL DEFAULT 'none',
            interest_rate NUMERIC(8, 6) NOT NULL DEFAULT 0,
            withdrawal_policy VARCHAR(30) NOT NULL DEFAULT 'block_overdraw',
            min_balance NUMERIC(15, 2) NOT NULL DEFAULT 0,
            min_opening_balance NUMERIC(15, 2) NOT NULL DEFAULT 0,
            dormancy_days INTEGER NOT NULL DEFAULT 180,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            created_by VARCHAR(36) NULL,
            updated_by VARCHAR(36) NULL,
            CONSTRAINT uniq_deposit_products_code UNIQUE (code)
        );
    ");
    echo "+ Created table 'deposit_products'.\n";
}

// ─── 2. deposit_accounts ─────────────────────────────────────────────
if ($tableExists('deposit_accounts')) {
    echo "✓ Table 'deposit_accounts' already exists.\n";
} else {
    $conn->executeStatement("
        CREATE TABLE deposit_accounts (
            id VARCHAR(36) NOT NULL PRIMARY KEY,
            account_number VARCHAR(20) NOT NULL,
            customer_id VARCHAR(36) NOT NULL REFERENCES customers(id),
            product_id VARCHAR(36) NOT NULL REFERENCES deposit_products(id),
            balance NUMERIC(15, 2) NOT NULL DEFAULT 0,
            status VARCHAR(20) NOT NULL DEFAULT 'active',
            opened_date DATE NOT NULL,
            last_activity_date DATE NULL,
            closed_date DATE NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            created_by VARCHAR(36) NULL,
            updated_by VARCHAR(36) NULL,
            CONSTRAINT uniq_deposit_accounts_number UNIQUE (account_number)
        );
        CREATE INDEX idx_deposit_accounts_customer ON deposit_accounts(customer_id);
        CREATE INDEX idx_deposit_accounts_product ON deposit_accounts(product_id);
        CREATE INDEX idx_deposit_accounts_status ON deposit_accounts(status);
    ");
    echo "+ Created table 'deposit_accounts' (+ 3 indexes).\n";
}

// ─── 3. deposit_transactions ─────────────────────────────────────────
if ($tableExists('deposit_transactions')) {
    echo "✓ Table 'deposit_transactions' already exists.\n";
} else {
    $conn->executeStatement("
        CREATE TABLE deposit_transactions (
            id VARCHAR(36) NOT NULL PRIMARY KEY,
            account_id VARCHAR(36) NOT NULL REFERENCES deposit_accounts(id),
            journal_entry_id VARCHAR(36) NOT NULL REFERENCES journal_entries(id),
            type VARCHAR(20) NOT NULL,
            amount NUMERIC(15, 2) NOT NULL,
            balance_after NUMERIC(15, 2) NOT NULL,
            narration VARCHAR(255) NOT NULL,
            reference VARCHAR(100) NULL,
            posting_date DATE NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            created_by VARCHAR(36) NULL,
            updated_by VARCHAR(36) NULL
        );
        CREATE INDEX idx_deposit_txns_account ON deposit_transactions(account_id);
        CREATE INDEX idx_deposit_txns_journal ON deposit_transactions(journal_entry_id);
        CREATE INDEX idx_deposit_txns_posting_date ON deposit_transactions(posting_date);
    ");
    echo "+ Created table 'deposit_transactions' (+ 3 indexes).\n";
}

// ─── 4. CUSTDEP ledger-type correction ───────────────────────────────
$custdepLedgerType = $conn->fetchOne(
    "SELECT ledger_type FROM general_ledgers WHERE account_code = 'CUSTDEP'"
);
if ($custdepLedgerType === false || $custdepLedgerType === null) {
    echo "! CUSTDEP GL not found — run bin/migrate-expand-chart-of-accounts.php first.\n";
} elseif ($custdepLedgerType === 'general') {
    echo "✓ CUSTDEP is already a GENERAL control account.\n";
} else {
    $conn->executeStatement(
        "UPDATE general_ledgers SET ledger_type = 'general', updated_at = CURRENT_TIMESTAMP WHERE account_code = 'CUSTDEP'"
    );
    echo "+ Updated CUSTDEP ledger_type '{$custdepLedgerType}' → 'general' (control account).\n";
}

echo "\nDeposits schema init done.\n";
echo "Next steps:\n";
echo "  1. Re-run bin/seed.php (or grant the deposits.* permissions) so the\n";
echo "     Accountant role can manage deposit products and accounts.\n";
echo "  2. Create a deposit product at POST /api/deposits/products.\n";
echo "  3. Open accounts and post deposits/withdrawals; run monthly interest\n";
echo "     via POST /api/deposits/interest/run.\n";
