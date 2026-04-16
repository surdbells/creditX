<?php
declare(strict_types=1);
require __DIR__ . '/../vendor/autoload.php';

$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
$dotenv->load();
$_ENV['APP_ENV'] = 'production';

$cacheDir = __DIR__ . '/../var/cache/doctrine';
$cache = new \Symfony\Component\Cache\Adapter\FilesystemAdapter('doctrine', 0, $cacheDir);

// Test the exact cache key Doctrine would use
$key = str_replace('\\', '__', 'App\Domain\Entity\User') . '__CLASSMETADATA__';
echo "Looking for cache key: {$key}\n";

$item = $cache->getItem($key);
echo "Cache hit: " . ($item->isHit() ? 'YES' : 'NO') . "\n";

if ($item->isHit()) {
    $metadata = $item->get();
    echo "Cached class: " . get_class($metadata) . "\n";
} else {
    echo "Cache MISS - this is why every request loads all metadata from scratch\n\n";
    
    // Check what keys ARE in the cache
    echo "Checking if ANY doctrine metadata is cached...\n";
    $testKeys = [
        'App__Domain__Entity__User__CLASSMETADATA__',
        'App__Domain__Entity__Role__CLASSMETADATA__',
        'App__Domain__Entity__Permission__CLASSMETADATA__',
    ];
    foreach ($testKeys as $tk) {
        $ti = $cache->getItem($tk);
        echo "  {$tk}: " . ($ti->isHit() ? 'HIT' : 'MISS') . "\n";
    }
    
    echo "\nNow loading metadata via EM to populate cache...\n";
    echo "Memory before: " . round(memory_get_usage(true)/1024/1024, 1) . " MB\n";
    
    $em = \App\Infrastructure\Persistence\DoctrineEntityManagerFactory::create();
    echo "Memory after EM: " . round(memory_get_usage(true)/1024/1024, 1) . " MB\n";
    
    // Get metadata factory and check its cache
    $mf = $em->getMetadataFactory();
    $refProp = new ReflectionProperty(get_class($mf), 'cache');
    $refProp->setAccessible(true);
    $mfCache = $refProp->getValue($mf);
    echo "MetadataFactory cache type: " . ($mfCache ? get_class($mfCache) : 'NULL') . "\n";
    
    if ($mfCache) {
        $testItem = $mfCache->getItem($key);
        echo "MF cache for User: " . ($testItem->isHit() ? 'HIT' : 'MISS') . "\n";
    }
}

echo "\nMemory: " . round(memory_get_peak_usage(true)/1024/1024, 1) . " MB\n";
