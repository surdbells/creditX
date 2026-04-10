<?php
declare(strict_types=1);
namespace App\Domain\Entity;

use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

#[ORM\Entity]
#[ORM\Table(name: 'payment_allocations')]
#[ORM\HasLifecycleCallbacks]
class PaymentAllocation
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\ManyToOne(targetEntity: Payment::class, inversedBy: 'allocations')]
    #[ORM\JoinColumn(name: 'payment_id', referencedColumnName: 'id', nullable: false)]
    private Payment $payment;

    #[ORM\ManyToOne(targetEntity: RepaymentSchedule::class)]
    #[ORM\JoinColumn(name: 'schedule_id', referencedColumnName: 'id', nullable: true)]
    private ?RepaymentSchedule $schedule = null;

    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)]
    private string $allocatedAmount;

    /** principal, interest, or penalty */
    #[ORM\Column(type: 'string', length: 20)]
    private string $allocationType;

    public function __construct() { $this->id = Uuid::uuid4()->toString(); }

    public function getId(): string { return $this->id; }
    public function getPayment(): Payment { return $this->payment; }
    public function setPayment(Payment $v): void { $this->payment = $v; }
    public function getSchedule(): ?RepaymentSchedule { return $this->schedule; }
    public function setSchedule(?RepaymentSchedule $v): void { $this->schedule = $v; }
    public function getAllocatedAmount(): string { return $this->allocatedAmount; }
    public function setAllocatedAmount(string $v): void { $this->allocatedAmount = $v; }
    public function getAllocationType(): string { return $this->allocationType; }
    public function setAllocationType(string $v): void { $this->allocationType = $v; }

    public function toArray(): array
    {
        return [
            'id' => $this->id, 'payment_id' => $this->payment->getId(),
            'schedule_id' => $this->schedule?->getId(),
            'schedule_installment' => $this->schedule?->getInstallmentNumber(),
            'allocated_amount' => $this->allocatedAmount,
            'allocation_type' => $this->allocationType,
        ];
    }
}
