<?php

declare(strict_types=1);

use App\Infrastructure\Logger\AppLogger;
use App\Infrastructure\Persistence\DoctrineEntityManagerFactory;
use App\Infrastructure\Service\JwtService;
use App\Infrastructure\Service\RedisService;
use App\Infrastructure\Service\SettingsCacheService;
use Doctrine\ORM\EntityManagerInterface;
use Monolog\Logger;
use Predis\Client as RedisClient;
use Psr\Container\ContainerInterface;
use Psr\Log\LoggerInterface;

return [
    // ─── Doctrine EntityManager ───
    EntityManagerInterface::class => function (ContainerInterface $c): EntityManagerInterface {
        return DoctrineEntityManagerFactory::create();
    },

    // ─── Redis ───
    RedisClient::class => function (): RedisClient {
        $params = [
            'scheme' => 'tcp',
            'host'   => $_ENV['REDIS_HOST'] ?? '127.0.0.1',
            'port'   => (int) ($_ENV['REDIS_PORT'] ?? 6379),
        ];

        $password = $_ENV['REDIS_PASSWORD'] ?? 'null';
        if ($password !== 'null' && $password !== '') {
            $params['password'] = $password;
        }

        return new RedisClient($params, [
            'prefix' => $_ENV['REDIS_PREFIX'] ?? 'creditx:',
        ]);
    },

    RedisService::class => function (ContainerInterface $c): RedisService {
        return new RedisService($c->get(RedisClient::class));
    },

    // ─── JWT ───
    JwtService::class => function (ContainerInterface $c): JwtService {
        return new JwtService($c->get(RedisService::class));
    },

    // ─── Logger ───
    LoggerInterface::class => function (): LoggerInterface {
        return AppLogger::create(
            $_ENV['APP_NAME'] ?? 'CreditX',
            $_ENV['LOG_PATH'] ?? __DIR__ . '/../var/log/app.log',
            $_ENV['LOG_LEVEL'] ?? 'debug'
        );
    },

    // ─── Settings Cache ───
    SettingsCacheService::class => function (ContainerInterface $c): SettingsCacheService {
        return new SettingsCacheService(
            $c->get(EntityManagerInterface::class),
            $c->get(RedisService::class)
        );
    },
];
