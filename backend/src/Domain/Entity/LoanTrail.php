<?php
declare(strict_types=1);
namespace App\Domain\Entity;

use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

#[ORM\Entity]
#[ORM\Table(name: 'loan_trails')]
#[ORM\Index(name: 'idx_loan_trails_loan', columns: ['loan_id'])]
#[ORM\HasLifecycleCallbacks]
class LoanTrail
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\ManyToOne(targetEntity: Loan::class, inversedBy: 'trails')]
    #[ORM\JoinColumn(name: 'loan_id', referencedColumnName: 'id', nullable: false)]
    private Loan $loan;

    #[ORM\Column(type: 'string', length: 36, nullable: true)]
    private ?string $userId = null;

    #[ORM\Column(type: 'string', length: 200)]
    private string $action;

    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $details = null;

    #[ORM\Column(type: 'string', length: 45, nullable: true)]
    private ?string $ipAddress = null;

    public function __construct() { $this->id = Uuid::uuid4()->toString(); }

    public function getId(): string { return $this->id; }
    public function getLoan(): Loan { return $this->loan; }
    public function setLoan(Loan $v): void { $this->loan = $v; }
    public function getUserId(): ?string { return $this->userId; }
    public function setUserId(?string $v): void { $this->userId = $v; }
    public function getAction(): string { return $this->action; }
    public function setAction(string $v): void { $this->action = $v; }
    public function getDetails(): ?array { return $this->details; }
    public function setDetails(?array $v): void { $this->details = $v; }
    public function getIpAddress(): ?string { return $this->ipAddress; }
    public function setIpAddress(?string $v): void { $this->ipAddress = $v; }

    public function toArray(): array
    {
        return [
            'id' => $this->id, 'loan_id' => $this->loan->getId(),
            'user_id' => $this->userId, 'action' => $this->action,
            'details' => $this->details, 'ip_address' => $this->ipAddress,
            'created_at' => $this->createdAt->format('Y-m-d H:i:s'),
        ];
    }
}
