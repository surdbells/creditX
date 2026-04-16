<?php
declare(strict_types=1);
require __DIR__ . '/../vendor/autoload.php';

$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
$dotenv->load();

echo "APP_ENV: " . ($_ENV['APP_ENV'] ?? 'NOT SET') . "\n";

$cacheDir = __DIR__ . '/../var/cache/doctrine';
echo "Cache dir exists: " . (is_dir($cacheDir) ? 'YES' : 'NO') . "\n";
echo "Cache dir readable: " . (is_readable($cacheDir) ? 'YES' : 'NO') . "\n";

// Count cache files
$cacheFiles = glob($cacheDir . '/*/*/*.php');
echo "Cache files found: " . count($cacheFiles ?: []) . "\n";

// Try to use the cache directly
$cache = new \Symfony\Component\Cache\Adapter\FilesystemAdapter('doctrine', 0, $cacheDir);

// Try to read a known cached item
$items = [];
foreach ($cache->getItems([]) as $item) {
    $items[] = $item->getKey();
}
echo "Cached items via adapter: " . count($items) . "\n";

// Check what the cache key format is
echo "\nSample cache files:\n";
$allFiles = [];
$iter = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($cacheDir));
foreach ($iter as $file) {
    if ($file->isFile()) {
        $allFiles[] = $file->getPathname();
    }
}
echo "  Total files in cache dir: " . count($allFiles) . "\n";
foreach (array_slice($allFiles, 0, 5) as $f) {
    echo "  " . str_replace($cacheDir, '', $f) . " (" . filesize($f) . " bytes)\n";
}

echo "\nMemory: " . round(memory_get_usage(true) / 1024 / 1024, 1) . " MB\n";
