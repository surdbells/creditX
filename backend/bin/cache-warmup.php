<?php

declare(strict_types=1);

/**
 * CreditX — Doctrine Cache Warmup
 * Run this after deployment to pre-generate metadata cache and proxy classes.
 * This prevents the first request from consuming excessive memory.
 */

require __DIR__ . '/../vendor/autoload.php';

if (file_exists(__DIR__ . '/../.env')) {
    $dotenv = \Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
    $dotenv->load();
}

// Force production mode
$_ENV['APP_ENV'] = 'production';

echo "=== CreditX Doctrine Cache Warmup ===\n\n";

$em = \App\Infrastructure\Persistence\DoctrineEntityManagerFactory::create();

// 1. Generate all proxy classes
echo "[1/2] Generating proxy classes...\n";
$metadata = $em->getMetadataFactory()->getAllMetadata();
echo "  Loaded " . count($metadata) . " entity metadata\n";

$em->getProxyFactory()->generateProxyClasses($metadata);
echo "  Proxy classes generated in var/proxies/\n";

// 2. Warm metadata cache (already done by getAllMetadata above with filesystem cache)
echo "[2/2] Metadata cache warmed\n";

echo "\nDone. Memory used: " . round(memory_get_peak_usage(true) / 1024 / 1024, 1) . " MB\n";
echo "Cache dir: var/cache/doctrine/\n";
echo "Proxy dir: var/proxies/\n";
