<?php

declare(strict_types=1);

use App\Infrastructure\Logger\AppLogger;
use App\Infrastructure\Persistence\DoctrineEntityManagerFactory;
use App\Infrastructure\Service\AuditService;
use App\Infrastructure\Service\BulkImportService;
use App\Infrastructure\Service\DocumentService;
use App\Infrastructure\Service\EligibilityService;
use App\Infrastructure\Service\JwtService;
use App\Infrastructure\Service\LoanCalculationService;
use App\Infrastructure\Service\RedisService;
use App\Infrastructure\Service\SettingsCacheService;
use App\Domain\Repository\AuditLogRepository;
use App\Domain\Repository\CustomerRepository;
use App\Domain\Repository\DocumentRepository;
use App\Domain\Repository\FeeTypeRepository;
use App\Domain\Repository\GovernmentRecordRepository;
use App\Domain\Repository\LocationRepository;
use App\Domain\Repository\LoanProductRepository;
use App\Domain\Repository\LoanRepository;
use App\Domain\Repository\PermissionRepository;
use App\Domain\Repository\RecordTypeRepository;
use App\Domain\Repository\RoleRepository;
use App\Domain\Repository\SystemSettingRepository;
use App\Domain\Repository\UserRepository;
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

    // ─── Repositories ───
    UserRepository::class => function (ContainerInterface $c): UserRepository {
        return new UserRepository($c->get(EntityManagerInterface::class));
    },
    RoleRepository::class => function (ContainerInterface $c): RoleRepository {
        return new RoleRepository($c->get(EntityManagerInterface::class));
    },
    PermissionRepository::class => function (ContainerInterface $c): PermissionRepository {
        return new PermissionRepository($c->get(EntityManagerInterface::class));
    },
    LocationRepository::class => function (ContainerInterface $c): LocationRepository {
        return new LocationRepository($c->get(EntityManagerInterface::class));
    },
    SystemSettingRepository::class => function (ContainerInterface $c): SystemSettingRepository {
        return new SystemSettingRepository($c->get(EntityManagerInterface::class));
    },
    AuditLogRepository::class => function (ContainerInterface $c): AuditLogRepository {
        return new AuditLogRepository($c->get(EntityManagerInterface::class));
    },
    RecordTypeRepository::class => function (ContainerInterface $c): RecordTypeRepository {
        return new RecordTypeRepository($c->get(EntityManagerInterface::class));
    },
    GovernmentRecordRepository::class => function (ContainerInterface $c): GovernmentRecordRepository {
        return new GovernmentRecordRepository($c->get(EntityManagerInterface::class));
    },
    CustomerRepository::class => function (ContainerInterface $c): CustomerRepository {
        return new CustomerRepository($c->get(EntityManagerInterface::class));
    },
    DocumentRepository::class => function (ContainerInterface $c): DocumentRepository {
        return new DocumentRepository($c->get(EntityManagerInterface::class));
    },
    FeeTypeRepository::class => function (ContainerInterface $c): FeeTypeRepository {
        return new FeeTypeRepository($c->get(EntityManagerInterface::class));
    },
    LoanProductRepository::class => function (ContainerInterface $c): LoanProductRepository {
        return new LoanProductRepository($c->get(EntityManagerInterface::class));
    },
    LoanRepository::class => function (ContainerInterface $c): LoanRepository {
        return new LoanRepository($c->get(EntityManagerInterface::class));
    },

    // ─── Domain Services ───
    AuditService::class => function (ContainerInterface $c): AuditService {
        return new AuditService($c->get(EntityManagerInterface::class));
    },
    EligibilityService::class => function (ContainerInterface $c): EligibilityService {
        return new EligibilityService();
    },
    BulkImportService::class => function (ContainerInterface $c): BulkImportService {
        return new BulkImportService(
            $c->get(EntityManagerInterface::class),
            $c->get(GovernmentRecordRepository::class)
        );
    },
    DocumentService::class => function (ContainerInterface $c): DocumentService {
        return new DocumentService($c->get(DocumentRepository::class));
    },
    LoanCalculationService::class => function (ContainerInterface $c): LoanCalculationService {
        return new LoanCalculationService();
    },
];
