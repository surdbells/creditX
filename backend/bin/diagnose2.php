<?php
declare(strict_types=1);
require __DIR__ . '/../vendor/autoload.php';

$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
$dotenv->load();

$_ENV['APP_ENV'] = 'production';

echo "Step 1: Create EM\n";
echo "  Mem: " . round(memory_get_usage(true) / 1024 / 1024, 1) . " MB\n";

$em = \App\Infrastructure\Persistence\DoctrineEntityManagerFactory::create();
echo "Step 2: EM created\n";
echo "  Mem: " . round(memory_get_usage(true) / 1024 / 1024, 1) . " MB\n";

echo "Step 3: getClassMetadata for User\n";
$meta = $em->getClassMetadata(\App\Domain\Entity\User::class);
echo "  Mem: " . round(memory_get_usage(true) / 1024 / 1024, 1) . " MB\n";
echo "  Loaded metadata count: " . count($em->getMetadataFactory()->getLoadedMetadata()) . "\n";

echo "Step 4: getRepository\n";
$repo = $em->getRepository(\App\Domain\Entity\User::class);
echo "  Mem: " . round(memory_get_usage(true) / 1024 / 1024, 1) . " MB\n";

echo "Step 5: getUnitOfWork()->getEntityPersister\n";
$persister = $em->getUnitOfWork()->getEntityPersister(\App\Domain\Entity\User::class);
echo "  Mem: " . round(memory_get_usage(true) / 1024 / 1024, 1) . " MB\n";
echo "  Loaded metadata count: " . count($em->getMetadataFactory()->getLoadedMetadata()) . "\n";

echo "Step 6: Direct DBAL query (bypassing ORM)\n";
$conn = $em->getConnection();
$result = $conn->fetchAssociative("SELECT id, email, first_name FROM users WHERE email = ?", ['admin@dostsuite.com']);
echo "  Result: " . ($result ? $result['email'] : 'NOT FOUND') . "\n";
echo "  Mem: " . round(memory_get_usage(true) / 1024 / 1024, 1) . " MB\n";

echo "\nPeak: " . round(memory_get_peak_usage(true) / 1024 / 1024, 1) . " MB\n";
