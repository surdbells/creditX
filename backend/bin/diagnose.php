<?php
declare(strict_types=1);
require __DIR__ . '/../vendor/autoload.php';

$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
$dotenv->load();

echo "APP_ENV: " . ($_ENV['APP_ENV'] ?? 'NOT SET') . "\n";
echo "Memory before EM: " . round(memory_get_usage(true) / 1024 / 1024, 1) . " MB\n";

// Replicate exactly what container.php does
$em = \App\Infrastructure\Persistence\DoctrineEntityManagerFactory::create();
echo "Memory after EM create: " . round(memory_get_usage(true) / 1024 / 1024, 1) . " MB\n";

// This is what triggers metadata loading - a simple findOneBy
echo "Running findOneBy...\n";
$result = $em->getRepository(\App\Domain\Entity\User::class)->findOneBy(['email' => 'admin@dostsuite.com']);
echo "Memory after query: " . round(memory_get_usage(true) / 1024 / 1024, 1) . " MB\n";
echo "User found: " . ($result ? $result->getEmail() : 'NO') . "\n";
echo "Peak memory: " . round(memory_get_peak_usage(true) / 1024 / 1024, 1) . " MB\n";
