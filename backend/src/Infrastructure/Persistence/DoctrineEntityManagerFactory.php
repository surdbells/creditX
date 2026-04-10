<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence;

use Doctrine\DBAL\DriverManager;
use Doctrine\DBAL\Types\Type;
use Doctrine\ORM\EntityManager;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\ORM\ORMSetup;

final class DoctrineEntityManagerFactory
{
    public static function create(): EntityManagerInterface
    {
        $isDevMode = ($_ENV['APP_ENV'] ?? 'development') !== 'production';

        $config = ORMSetup::createAttributeMetadataConfiguration(
            paths: [__DIR__ . '/../../Domain/Entity'],
            isDevMode: $isDevMode,
            proxyDir: __DIR__ . '/../../../var/proxies',
        );

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

        return new EntityManager($connection, $config);
    }
}
