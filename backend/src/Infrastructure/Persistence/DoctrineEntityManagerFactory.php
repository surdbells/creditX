<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence;

use Doctrine\DBAL\DriverManager;
use Doctrine\DBAL\Types\Type;
use Doctrine\ORM\EntityManager;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\ORM\Mapping\UnderscoreNamingStrategy;
use Doctrine\ORM\ORMSetup;
use Symfony\Component\Cache\Adapter\FilesystemAdapter;
use Symfony\Component\Cache\Adapter\ArrayAdapter;

final class DoctrineEntityManagerFactory
{
    private static ?EntityManagerInterface $instance = null;

    public static function create(): EntityManagerInterface
    {
        // Singleton — reuse EM within same request to avoid re-loading metadata
        if (self::$instance !== null && self::$instance->isOpen()) {
            return self::$instance;
        }

        $isDevMode = ($_ENV['APP_ENV'] ?? 'development') !== 'production';
        $cacheDir = __DIR__ . '/../../../var/cache/doctrine';
        $proxyDir = __DIR__ . '/../../../var/proxies';

        // Ensure cache directories exist
        if (!is_dir($cacheDir)) { @mkdir($cacheDir, 0775, true); }
        if (!is_dir($proxyDir)) { @mkdir($proxyDir, 0775, true); }

        // Use filesystem cache in production, array cache in dev
        if ($isDevMode) {
            $cache = new ArrayAdapter();
        } else {
            $cache = new FilesystemAdapter('doctrine', 0, $cacheDir);
        }

        $config = ORMSetup::createAttributeMetadataConfiguration(
            paths: [__DIR__ . '/../../Domain/Entity'],
            isDevMode: $isDevMode,
            proxyDir: $proxyDir,
            cache: $cache,
        );

        // Use underscore naming strategy: camelCase → snake_case columns
        $config->setNamingStrategy(new UnderscoreNamingStrategy(CASE_LOWER));

        // In production, use pre-generated proxies
        if (!$isDevMode) {
            $config->setAutoGenerateProxyClasses(false);
        }

        // Register custom DBAL types
        if (!Type::hasType('uuid')) {
            Type::addType('uuid', UuidType::class);
        }

        $connectionParams = [
            'driver'   => $_ENV['DB_DRIVER'] ?? 'pdo_pgsql',
            'host'     => $_ENV['DB_HOST'] ?? '127.0.0.1',
            'port'     => (int) ($_ENV['DB_PORT'] ?? 5432),
            'dbname'   => $_ENV['DB_NAME'] ?? 'creditx',
            'user'     => $_ENV['DB_USER'] ?? 'creditx_user',
            'password' => $_ENV['DB_PASSWORD'] ?? 'secret',
            'charset'  => $_ENV['DB_CHARSET'] ?? 'utf8',
        ];

        $connection = DriverManager::getConnection($connectionParams, $config);

        self::$instance = new EntityManager($connection, $config);
        return self::$instance;
    }
}
