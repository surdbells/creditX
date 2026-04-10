<?php
declare(strict_types=1);
namespace App\Domain\Entity;

use App\Domain\Enum\MakerCheckerStatus;
use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

#[ORM\Entity(repositoryClass: \App\Domain\Repository\MakerCheckerRepository::class)]
#[ORM\Table(name: 'maker_checker_requests')]
#[ORM\Index(name: 'idx_mc_status', columns: ['status'])]
#[ORM\Index(name: 'idx_mc_operation', columns: ['operation_type'])]
#[ORM\HasLifecycleCallbacks]
class MakerCheckerRequest
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    /** e.g., disbursement, write_off, gl_entry, reversal */
    #[ORM\Column(type: 'string', length: 50)]
    private string $operationType;

    #[ORM\Column(type: 'string', length: 100)]
    private string $entityType;

    #[ORM\Column(type: 'string', length: 36, nullable: true)]
    private ?string $entityId = null;

    /** Full operation payload stored as JSON */
    #[ORM\Column(type: 'json')]
    private array $payload;

    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(name: 'maker_id', referencedColumnName: 'id', nullable: false)]
    private User $maker;

    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(name: 'checker_id', referencedColumnName: 'id', nullable: true)]
    private ?User $checker = null;

    #[ORM\Column(type: 'string', length: 20, enumType: MakerCheckerStatus::class)]
    private MakerCheckerStatus $status = MakerCheckerStatus::PENDING;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $makerComment = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $checkerComment = null;

    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $decidedAt = null;

    public function __construct() { $this->id = Uuid::uuid4()->toString(); }

    public function getId(): string { return $this->id; }
    public function getOperationType(): string { return $this->operationType; }
    public function setOperationType(string $v): void { $this->operationType = $v; }
    public function getEntityType(): string { return $this->entityType; }
    public function setEntityType(string $v): void { $this->entityType = $v; }
    public function getEntityId(): ?string { return $this->entityId; }
    public function setEntityId(?string $v): void { $this->entityId = $v; }
    public function getPayload(): array { return $this->payload; }
    public function setPayload(array $v): void { $this->payload = $v; }
    public function getMaker(): User { return $this->maker; }
    public function setMaker(User $v): void { $this->maker = $v; }
    public function getChecker(): ?User { return $this->checker; }
    public function getStatus(): MakerCheckerStatus { return $this->status; }
    public function getMakerComment(): ?string { return $this->makerComment; }
    public function setMakerComment(?string $v): void { $this->makerComment = $v; }
    public function getCheckerComment(): ?string { return $this->checkerComment; }
    public function getDecidedAt(): ?\DateTimeImmutable { return $this->decidedAt; }

    public function approve(User $checker, ?string $comment = null): void
    {
        $this->status = MakerCheckerStatus::APPROVED;
        $this->checker = $checker;
        $this->checkerComment = $comment;
        $this->decidedAt = new \DateTimeImmutable('now', new \DateTimeZone($_ENV['APP_TIMEZONE'] ?? 'Africa/Lagos'));
    }

    public function reject(User $checker, ?string $comment = null): void
    {
        $this->status = MakerCheckerStatus::REJECTED;
        $this->checker = $checker;
        $this->checkerComment = $comment;
        $this->decidedAt = new \DateTimeImmutable('now', new \DateTimeZone($_ENV['APP_TIMEZONE'] ?? 'Africa/Lagos'));
    }

    public function isPending(): bool { return $this->status === MakerCheckerStatus::PENDING; }

    public function toArray(): array
    {
        return [
            'id' => $this->id, 'operation_type' => $this->operationType,
            'entity_type' => $this->entityType, 'entity_id' => $this->entityId,
            'payload' => $this->payload,
            'maker_id' => $this->maker->getId(), 'maker_name' => $this->maker->getFullName(),
            'checker_id' => $this->checker?->getId(), 'checker_name' => $this->checker?->getFullName(),
            'status' => $this->status->value,
            'maker_comment' => $this->makerComment, 'checker_comment' => $this->checkerComment,
            'decided_at' => $this->decidedAt?->format('Y-m-d H:i:s'), 'created_at' => $this->createdAt->format('Y-m-d H:i:s'),
        ];
    }
}
