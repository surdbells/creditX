<?php

declare(strict_types=1);

use App\Infrastructure\Logger\AppLogger;
use App\Infrastructure\Persistence\DoctrineEntityManagerFactory;
use App\Infrastructure\Service\ApprovalEngineService;
use App\Infrastructure\Service\AuditService;
use App\Infrastructure\Service\BulkImportService;
use App\Infrastructure\Service\DisbursementService;
use App\Infrastructure\Service\LoanLifecycleService;
use App\Infrastructure\Service\NotificationDispatchService;
use App\Infrastructure\Service\OverdueService;
use App\Infrastructure\Service\ReportingService;
use App\Infrastructure\Service\ReconciliationService;
use App\Infrastructure\Service\ExportService;
use App\Infrastructure\Service\RepaymentService;
use App\Infrastructure\Service\BulkRepaymentService;
use App\Infrastructure\Service\DocumentService;
use App\Infrastructure\Service\EligibilityService;
use App\Infrastructure\Service\JwtService;
use App\Infrastructure\Service\LoanCalculationService;
use App\Infrastructure\Service\RedisService;
use App\Infrastructure\Service\SettingsCacheService;
use App\Domain\Repository\AuditLogRepository;
use App\Domain\Repository\ApprovalWorkflowRepository;
use App\Domain\Repository\LoanApprovalRepository;
use App\Domain\Repository\CustomerRepository;
use App\Domain\Repository\CustomerLedgerRepository;
use App\Domain\Repository\DocumentRepository;
use App\Domain\Repository\FeeTypeRepository;
use App\Domain\Repository\GeneralLedgerRepository;
use App\Domain\Repository\GovernmentRecordRepository;
use App\Domain\Repository\LedgerTransactionRepository;
use App\Domain\Repository\LocationRepository;
use App\Domain\Repository\LoanProductRepository;
use App\Domain\Repository\LoanRepository;
use App\Domain\Repository\MakerCheckerRepository;
use App\Domain\Repository\PaymentRepository;
use App\Domain\Repository\PenaltyRuleRepository;
use App\Domain\Repository\BulkUploadRepository;
use App\Domain\Repository\ConversationRepository;
use App\Domain\Repository\NotificationRepository;
use App\Domain\Repository\NotificationTemplateRepository;
use App\Domain\Repository\ReconciliationRepository;
use App\Domain\Repository\PermissionRepository;
use App\Domain\Repository\RecordTypeRepository;
use App\Domain\Repository\RepaymentScheduleRepository;
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
    ApprovalWorkflowRepository::class => function (ContainerInterface $c): ApprovalWorkflowRepository {
        return new ApprovalWorkflowRepository($c->get(EntityManagerInterface::class));
    },
    LoanApprovalRepository::class => function (ContainerInterface $c): LoanApprovalRepository {
        return new LoanApprovalRepository($c->get(EntityManagerInterface::class));
    },
    GeneralLedgerRepository::class => function (ContainerInterface $c): GeneralLedgerRepository {
        return new GeneralLedgerRepository($c->get(EntityManagerInterface::class));
    },
    CustomerLedgerRepository::class => function (ContainerInterface $c): CustomerLedgerRepository {
        return new CustomerLedgerRepository($c->get(EntityManagerInterface::class));
    },
    LedgerTransactionRepository::class => function (ContainerInterface $c): LedgerTransactionRepository {
        return new LedgerTransactionRepository($c->get(EntityManagerInterface::class));
    },
    RepaymentScheduleRepository::class => function (ContainerInterface $c): RepaymentScheduleRepository {
        return new RepaymentScheduleRepository($c->get(EntityManagerInterface::class));
    },
    MakerCheckerRepository::class => function (ContainerInterface $c): MakerCheckerRepository {
        return new MakerCheckerRepository($c->get(EntityManagerInterface::class));
    },
    PaymentRepository::class => function (ContainerInterface $c): PaymentRepository {
        return new PaymentRepository($c->get(EntityManagerInterface::class));
    },
    PenaltyRuleRepository::class => function (ContainerInterface $c): PenaltyRuleRepository {
        return new PenaltyRuleRepository($c->get(EntityManagerInterface::class));
    },
    BulkUploadRepository::class => function (ContainerInterface $c): BulkUploadRepository {
        return new BulkUploadRepository($c->get(EntityManagerInterface::class));
    },
    NotificationTemplateRepository::class => function (ContainerInterface $c): NotificationTemplateRepository {
        return new NotificationTemplateRepository($c->get(EntityManagerInterface::class));
    },
    NotificationRepository::class => function (ContainerInterface $c): NotificationRepository {
        return new NotificationRepository($c->get(EntityManagerInterface::class));
    },
    ConversationRepository::class => function (ContainerInterface $c): ConversationRepository {
        return new ConversationRepository($c->get(EntityManagerInterface::class));
    },
    ReconciliationRepository::class => function (ContainerInterface $c): ReconciliationRepository {
        return new ReconciliationRepository($c->get(EntityManagerInterface::class));
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
    ApprovalEngineService::class => function (ContainerInterface $c): ApprovalEngineService {
        return new ApprovalEngineService(
            $c->get(EntityManagerInterface::class),
            $c->get(ApprovalWorkflowRepository::class),
            $c->get(LoanApprovalRepository::class),
            $c->get(SettingsCacheService::class)
        );
    },
    DisbursementService::class => function (ContainerInterface $c): DisbursementService {
        return new DisbursementService(
            $c->get(EntityManagerInterface::class),
            $c->get(GeneralLedgerRepository::class),
            $c->get(CustomerLedgerRepository::class),
            $c->get(LoanCalculationService::class),
            $c->get(SettingsCacheService::class)
        );
    },
    RepaymentService::class => function (ContainerInterface $c): RepaymentService {
        return new RepaymentService(
            $c->get(EntityManagerInterface::class),
            $c->get(GeneralLedgerRepository::class),
            $c->get(CustomerLedgerRepository::class),
            $c->get(RepaymentScheduleRepository::class),
            $c->get(SettingsCacheService::class)
        );
    },
    BulkRepaymentService::class => function (ContainerInterface $c): BulkRepaymentService {
        return new BulkRepaymentService(
            $c->get(EntityManagerInterface::class),
            $c->get(BulkUploadRepository::class),
            $c->get(CustomerLedgerRepository::class),
            $c->get(LoanRepository::class),
            $c->get(RepaymentService::class)
        );
    },
    OverdueService::class => function (ContainerInterface $c): OverdueService {
        return new OverdueService(
            $c->get(EntityManagerInterface::class),
            $c->get(RepaymentScheduleRepository::class),
            $c->get(PenaltyRuleRepository::class),
            $c->get(GeneralLedgerRepository::class),
            $c->get(CustomerLedgerRepository::class),
            $c->get(SettingsCacheService::class)
        );
    },
    LoanLifecycleService::class => function (ContainerInterface $c): LoanLifecycleService {
        return new LoanLifecycleService(
            $c->get(EntityManagerInterface::class),
            $c->get(GeneralLedgerRepository::class),
            $c->get(CustomerLedgerRepository::class),
            $c->get(RepaymentScheduleRepository::class),
            $c->get(LoanCalculationService::class)
        );
    },
    NotificationDispatchService::class => function (ContainerInterface $c): NotificationDispatchService {
        return new NotificationDispatchService(
            $c->get(EntityManagerInterface::class),
            $c->get(NotificationTemplateRepository::class),
            $c->get(NotificationRepository::class),
            $c->get(SettingsCacheService::class),
            $c->get(\Psr\Log\LoggerInterface::class)
        );
    },
    ReportingService::class => function (ContainerInterface $c): ReportingService {
        return new ReportingService($c->get(EntityManagerInterface::class));
    },
    ReconciliationService::class => function (ContainerInterface $c): ReconciliationService {
        return new ReconciliationService(
            $c->get(EntityManagerInterface::class),
            $c->get(ReconciliationRepository::class),
            $c->get(LedgerTransactionRepository::class)
        );
    },
    ExportService::class => function (ContainerInterface $c): ExportService {
        return new ExportService();
    },
];
