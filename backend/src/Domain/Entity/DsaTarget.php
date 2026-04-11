<?php
declare(strict_types=1);
namespace App\Domain\Entity;

use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

#[ORM\Entity(repositoryClass: \App\Domain\Repository\DsaTargetRepository::class)]
#[ORM\Table(name: 'dsa_targets')]
#[ORM\UniqueConstraint(name: 'uniq_dsa_target_period', columns: ['user_id', 'period_year', 'period_month'])]
#[ORM\HasLifecycleCallbacks]
class DsaTarget
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(name: 'user_id', referencedColumnName: 'id', nullable: false)]
    private User $user;

    #[ORM\ManyToOne(targetEntity: Location::class)]
    #[ORM\JoinColumn(name: 'location_id', referencedColumnName: 'id', nullable: true)]
    private ?Location $location = null;

    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)]
    private string $targetAmount;

    #[ORM\Column(type: 'integer', options: ['default' => 0])]
    private int $targetCount = 0;

    #[ORM\Column(type: 'string', length: 4)]
    private string $periodYear;

    #[ORM\Column(type: 'string', length: 2)]
    private string $periodMonth;

    public function __construct() { $this->id = Uuid::uuid4()->toString(); }

    public function getId(): string { return $this->id; }
    public function getUser(): User { return $this->user; }
    public function setUser(User $v): void { $this->user = $v; }
    public function getLocation(): ?Location { return $this->location; }
    public function setLocation(?Location $v): void { $this->location = $v; }
    public function getTargetAmount(): string { return $this->targetAmount; }
    public function setTargetAmount(string $v): void { $this->targetAmount = $v; }
    public function getTargetCount(): int { return $this->targetCount; }
    public function setTargetCount(int $v): void { $this->targetCount = $v; }
    public function getPeriodYear(): string { return $this->periodYear; }
    public function setPeriodYear(string $v): void { $this->periodYear = $v; }
    public function getPeriodMonth(): string { return $this->periodMonth; }
    public function setPeriodMonth(string $v): void { $this->periodMonth = str_pad($v, 2, '0', STR_PAD_LEFT); }

    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'user_id' => $this->user->getId(),
            'user_name' => $this->user->getFullName(),
            'location_id' => $this->location?->getId(),
            'location_name' => $this->location?->getName(),
            'target_amount' => $this->targetAmount,
            'target_count' => $this->targetCount,
            'period_year' => $this->periodYear,
            'period_month' => $this->periodMonth,
            'period' => $this->periodYear . '-' . $this->periodMonth,
            'created_at' => $this->createdAt->format('Y-m-d H:i:s'),
        ];
    }
}
