<?php

declare(strict_types=1);

/**
 * CreditX — seed default Nigerian tax rates (idempotent).
 *
 *   VAT75   VAT  7.5%   Standard value-added tax
 *   WHT5    WHT  5%     Withholding tax (most services/supplies)
 *   WHT10   WHT  10%    Withholding tax (dividends/rent/professional)
 *
 * Run once on deploy:  php bin/init-tax-rates.php
 * Re-running is a no-op (checks by code).
 */

require __DIR__ . '/../vendor/autoload.php';

if (file_exists(__DIR__ . '/../.env')) {
    (\Dotenv\Dotenv::createImmutable(__DIR__ . '/..'))->load();
}

use App\Domain\Entity\TaxRate;

echo "=== CreditX tax-rate seed ===\n\n";

$em = \App\Infrastructure\Persistence\DoctrineEntityManagerFactory::create();
$repo = $em->getRepository(TaxRate::class);

$rates = [
    // [code, name, type, rate, description]
    ['VAT75', 'VAT 7.5%', 'VAT', '0.0750', 'Standard value-added tax'],
    ['WHT5',  'WHT 5%',   'WHT', '0.0500', 'Withholding tax — most services / supplies'],
    ['WHT10', 'WHT 10%',  'WHT', '0.1000', 'Withholding tax — dividends / rent / professional fees'],
];

$inserted = 0; $skipped = 0;
foreach ($rates as [$code, $name, $type, $rate, $desc]) {
    if ($repo->findOneBy(['code' => $code]) !== null) {
        echo "  ✓ {$code} already exists — skipping\n";
        $skipped++;
        continue;
    }
    $r = new TaxRate();
    $r->setCode($code);
    $r->setName($name);
    $r->setType($type);
    $r->setRate($rate);
    $r->setDescription($desc);
    $em->persist($r);
    echo "  + {$code}: {$name}\n";
    $inserted++;
}
if ($inserted > 0) $em->flush();

echo "\nDone. Inserted: {$inserted}, skipped: {$skipped}.\n";
