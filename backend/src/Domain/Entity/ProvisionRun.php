<?php
declare(strict_types=1);
namespace App\Domain\Entity;

use App\Domain\Enum\ProvisionStatus;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

/**
 * ProvisionRun — header record for one CBN-style provision cycle.
 *
 * A provision run represents the accountant's decision to 'take
 * stock' of loan losses as of a particular date. It calculates the
 * required cumulative allowance per non-performing loan and posts
 * the DELTA against the GL (not the full amount — see the lines
 * table for snapshot semantics).
 *
 * One run typically happens per month, aligned with the CBN monthly
 * return cycle.
 *
 * ## Lifecycle
 *
 *   POSTED    — journal in GL. The user may run again next month —
 *               that next run computes its deltas against THIS
 *               run's per-loan line snapshots.
 *   REVERSED  — journal reversed via JournalReversalService. The
 *               lines remain for audit; next run skips reversed
 *               runs when looking up prior provision amounts.
 *
 * ## Callback ref
 *
 *   `PROV-YYYY-MM-<timestamp>` groups every ledger posting for this
 *   run. Reverse-in-one-shot works out of the box because
 *   JournalReversalService reverses every entry sharing a callback.
 */
#[ORM\Entity]
#[ORM\Table(name: 'provision_runs')]
#[ORM\Index(name: 'idx_provrun_status_as_of', columns: ['status', 'as_of'])]
#[ORM\HasLifecycleCallbacks]
class ProvisionRun
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\Column(type: 'date')]
    private \DateTimeInterface $asOf;

    #[ORM\Column(type: 'string', length: 20, enumType: ProvisionStatus::class)]
    private ProvisionStatus $status = ProvisionStatus::POSTED;

    /** Callback ref that groups every posted ledger entry for this run. */
    #[ORM\Column(type: 'string', length: 100, nullable: true)]
    private ?string $callbackRef = null;

    /** Summary totals captured at run time — cheap to re-derive but
     *  very convenient for list views. */
    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)]
    private string $totalProvisionRequired = '0.00';

    /** Sum of prior provisions that this run built upon. */
    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)]
    private string $totalPriorProvision = '0.00';

    /** Net DELTA posted this run (required − prior). Positive = new
     *  provision posted; negative = release. Zero is possible if
     *  nothing changed month-over-month. */
    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)]
    private string $totalDeltaPosted = '0.00';

    /** Count of non-performing loans included in this run. */
    #[ORM\Column(type: 'integer')]
    private int $loanCount = 0;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $notes = null;

    #[ORM\Column(type: 'string', length: 36, nullable: true)]
    private ?string $createdBy = null;

    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $reversedAt = null;

    #[ORM\Column(type: 'string', length: 36, nullable: true)]
    private ?string $reversedBy = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $reversalReason = null;

    /** @var Collection<int, ProvisionRunLine> */
    #[ORM\OneToMany(targetEntity: ProvisionRunLine::class, mappedBy: 'run', cascade: ['persist', 'remove'], orphanRemoval: true)]
    private Collection $lines;

    public function __construct()
    {
        $this->id = Uuid::uuid4()->toString();
        $this->lines = new ArrayCollection();
    }

    public function getId(): string { return $this->id; }
    public function getAsOf(): \DateTimeInterface { return $this->asOf; }
    public function setAsOf(\DateTimeInterface $v): void { $this->asOf = $v; }
    public function getStatus(): ProvisionStatus { return $this->status; }
    public function setStatus(ProvisionStatus $v): void { $this->status = $v; }
    public function getCallbackRef(): ?string { return $this->callbackRef; }
    public function setCallbackRef(?string $v): void { $this->callbackRef = $v; }
    public function getTotalProvisionRequired(): string { return $this->totalProvisionRequired; }
    public function setTotalProvisionRequired(string $v): void { $this->totalProvisionRequired = $v; }
    public function getTotalPriorProvision(): string { return $this->totalPriorProvision; }
    public function setTotalPriorProvision(string $v): void { $this->totalPriorProvision = $v; }
    public function getTotalDeltaPosted(): string { return $this->totalDeltaPosted; }
    public function setTotalDeltaPosted(string $v): void { $this->totalDeltaPosted = $v; }
    public function getLoanCount(): int { return $this->loanCount; }
    public function setLoanCount(int $v): void { $this->loanCount = $v; }
    public function getNotes(): ?string { return $this->notes; }
    public function setNotes(?string $v): void { $this->notes = $v; }
    public function getCreatedBy(): ?string { return $this->createdBy; }
    public function setCreatedBy(?string $v): void { $this->createdBy = $v; }
    public function getReversedAt(): ?\DateTimeImmutable { return $this->reversedAt; }
    public function setReversedAt(?\DateTimeImmutable $v): void { $this->reversedAt = $v; }
    public function getReversedBy(): ?string { return $this->reversedBy; }
    public function setReversedBy(?string $v): void { $this->reversedBy = $v; }
    public function getReversalReason(): ?string { return $this->reversalReason; }
    public function setReversalReason(?string $v): void { $this->reversalReason = $v; }
    /** @return Collection<int, ProvisionRunLine> */
    public function getLines(): Collection { return $this->lines; }
    public function addLine(ProvisionRunLine $line): void
    {
        if (!$this->lines->contains($line)) {
            $this->lines->add($line);
            $line->setRun($this);
        }
    }

    public function isPosted(): bool { return $this->status === ProvisionStatus::POSTED; }
    public function isReversed(): bool { return $this->status === ProvisionStatus::REVERSED; }

    public function toArray(bool $includeLines = false): array
    {
        $data = [
            'id'                       => $this->id,
            'as_of'                    => $this->asOf->format('Y-m-d'),
            'status'                   => $this->status->value,
            'callback_ref'             => $this->callbackRef,
            'total_provision_required' => $this->totalProvisionRequired,
            'total_prior_provision'    => $this->totalPriorProvision,
            'total_delta_posted'       => $this->totalDeltaPosted,
            'loan_count'               => $this->loanCount,
            'notes'                    => $this->notes,
            'created_by'               => $this->createdBy,
            'created_at'               => $this->createdAt->format('Y-m-d H:i:s'),
            'reversed_at'              => $this->reversedAt?->format('Y-m-d H:i:s'),
            'reversed_by'              => $this->reversedBy,
            'reversal_reason'          => $this->reversalReason,
        ];
        if ($includeLines) {
            $data['lines'] = array_map(
                fn(ProvisionRunLine $l) => $l->toArray(),
                $this->lines->toArray(),
            );
        }
        return $data;
    }
}
