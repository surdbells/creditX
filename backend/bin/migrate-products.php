<?php
declare(strict_types=1);

/**
 * Seed loan products from legacy FTI Pay products table.
 *
 * Usage:  php bin/migrate-products.php
 *
 * Creates 9 loan products mirroring the legacy `products` table and
 * attaches the 4 standard fees to each (admin, insurance, management,
 * bank-statement). Safe to re-run: skips products that already exist
 * by code, skips fees already attached.
 */

require __DIR__ . '/../vendor/autoload.php';

use App\Domain\Entity\{LoanProduct, ProductFee, FeeType};
use App\Domain\Enum\{InterestMethod, FeeCalculationType, FeeAppliesTo};
use App\Infrastructure\Persistence\DoctrineEntityManagerFactory;

$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
$dotenv->load();

// Force production mode for CLI to reduce memory
$_ENV['APP_ENV'] = 'production';

$em = DoctrineEntityManagerFactory::create();

// Legacy products from FTI Pay: products_id | product_name | interest_rate
$legacyProducts = [
    ['code' => 'NPF',  'name' => 'Nigeria Police Force',              'rate' => 0.05],
    ['code' => 'LSG',  'name' => 'Lagos State Government',            'rate' => 0.05],
    ['code' => 'TSC',  'name' => 'TESCOM',                            'rate' => 0.05],
    ['code' => 'SBB',  'name' => 'SUBEB',                             'rate' => 0.05],
    ['code' => 'NSC',  'name' => 'NSCDC',                             'rate' => 0.05],
    ['code' => 'NGC',  'name' => 'Nigeria Customs',                   'rate' => 0.05],
    ['code' => 'FCT',  'name' => 'FCTD',                              'rate' => 0.05],
    ['code' => 'OSC',  'name' => 'ONDO STATE CIVIL SERVICE MINISTRY', 'rate' => 0.05],
    ['code' => 'FED',  'name' => 'Federal Institutions',              'rate' => 0.05],
];

// Fee definitions matching legacy calculateLoan() function and existing seed codes:
//   admin_fee        = ₦2,000 flat         (code: AF)
//   insurance_fee    = 2% of app_amount    (code: IF)
//   management_fee   = 2% of app_amount    (code: MF)
//   bank_statement_fee = ₦500 flat         (code: BSF) — CONDITIONAL on statement_mode
$feeDefinitions = [
    ['code' => 'AF',  'name' => 'Admin Fee',          'calc' => FeeCalculationType::FLAT,       'value' => '2000.00'],
    ['code' => 'IF',  'name' => 'Insurance Fee',      'calc' => FeeCalculationType::PERCENTAGE, 'value' => '2.00'],
    ['code' => 'MF',  'name' => 'Management Fee',     'calc' => FeeCalculationType::PERCENTAGE, 'value' => '2.00'],
    ['code' => 'BSF', 'name' => 'Bank Statement Fee', 'calc' => FeeCalculationType::FLAT,       'value' => '500.00'],
];

echo "\n=== CreditX Products Migration ===\n\n";

// Step 1: Ensure all fee types exist
echo "Step 1: Verifying fee types...\n";
$feeTypeRepo = $em->getRepository(FeeType::class);
$feeTypes = [];
foreach ($feeDefinitions as $def) {
    $ft = $feeTypeRepo->findOneBy(['code' => $def['code']]);
    if ($ft === null) {
        $ft = new FeeType();
        $ft->setName($def['name']);
        $ft->setCode($def['code']);
        $ft->setIsSystem(true);
        $ft->setIsActive(true);
        $em->persist($ft);
        echo "  + Created fee type: {$def['name']} ({$def['code']})\n";
    } else {
        echo "  ✓ Fee type exists: {$def['name']} ({$def['code']})\n";
    }
    $feeTypes[$def['code']] = $ft;
}
$em->flush();

// Step 2: Create or update products
echo "\nStep 2: Migrating loan products...\n";
$productRepo = $em->getRepository(LoanProduct::class);
$created = 0;
$skipped = 0;

foreach ($legacyProducts as $legacy) {
    $existing = $productRepo->findOneBy(['code' => $legacy['code']]);
    if ($existing !== null) {
        echo "  ✓ Product exists, skipping: {$legacy['name']} ({$legacy['code']})\n";
        $skipped++;
        continue;
    }

    $product = new LoanProduct();
    $product->setName($legacy['name']);
    $product->setCode($legacy['code']);
    $product->setDescription('Migrated from FTI Pay legacy system');
    $product->setInterestRate((string) $legacy['rate']);
    $product->setInterestCalculationMethod(InterestMethod::FLAT_RATE);
    $product->setMinAmount('50000.00');
    $product->setMaxAmount('5000000.00');
    $product->setMinTenure(1);
    $product->setMaxTenure(24);
    $product->setAllowsTopUp(true);
    $product->setIsActive(true);

    $em->persist($product);
    $em->flush();

    // Attach fees
    foreach ($feeDefinitions as $def) {
        $fee = new ProductFee();
        $fee->setProduct($product);
        $fee->setFeeType($feeTypes[$def['code']]);
        $fee->setCalculationType($def['calc']);
        $fee->setValue($def['value']);
        $fee->setIsDeductedAtSource(true);
        $fee->setAppliesTo(FeeAppliesTo::PRINCIPAL);
        $fee->setIsActive(true);
        $em->persist($fee);
    }
    $em->flush();

    echo "  + Created: {$legacy['name']} ({$legacy['code']}) @ {$legacy['rate']}% with 4 fees\n";
    $created++;
}

echo "\n=== Migration Complete ===\n";
echo "  Created: {$created}\n";
echo "  Skipped: {$skipped}\n";
echo "  Total:   " . count($legacyProducts) . "\n\n";
echo "Note: Bank Statement Fee is attached to all products but only applies\n";
echo "      when loan.bank_statement_mode = 'generated_by_company'.\n";
echo "      Loan calculation service should check this field before applying it.\n\n";
