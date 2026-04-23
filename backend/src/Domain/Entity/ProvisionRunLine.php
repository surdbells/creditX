<?php
declare(strict_types=1);
namespace App\Domain\Entity;

use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

/**
 * ProvisionRunLine — per-loan snapshot from a single provision run.
 *
 * Snapshot semantics:
 *   At run time, for each non-performing loan we capture the
 *   outstanding balance, CBN classification (Substandard / Doubtful
 *   / Lost), the provision rate applied, the full provision amount
 *   required as of that date, and the PRIOR provision that was
 *   carried from the previous (non-reversed) run.
 *
 * Delta = required − prior. This is what actually gets posted.
 *
 * Next month's run looks up THIS row when computing deltas — the
 * previous provision_amount_required becomes the next run's
 * prior_provision_amount. If this run is later REVERSED, the next
 * run skips it and walks back to the preceding POSTED run.
 *
 * Why snapshot instead of live-query:
 *   A loan's outstanding balance changes as payments come in. The
 *   provision booked on 2026-04-30 was computed against that day's
 *   outstanding — re-running the calc on 2026-05-15 would get
 *   different numbers. Snapshots preserve the integrity of the
 *   posted journal.
 */
#[ORM\Entity]
#[ORM\Table(name: 'provision_run_lines')]
#[ORM\Index(name: 'idx_provline_loan', columns: ['loan_id'])]
#[ORM\HasLifecycleCallbacks]
class ProvisionRunLine
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\ManyToOne(targetEntity: ProvisionRun::class, inversedBy: 'lines')]
    #[ORM\JoinColumn(name: 'run_id', referencedColumnName: 'id', nullable: false)]
    private ProvisionRun $run;

    #[ORM\ManyToOne(targetEntity: Loan::class)]
    #[ORM\JoinColumn(name: 'loan_id', referencedColumnName: 'id', nullable: false)]
    private Loan $loan;

    /** Snapshot of loan.application_id for audit display without a join. */
    #[ORM\Column(type: 'string', length: 30)]
    private string $applicationIdSnapshot;

    /** Outstanding balance on the loan at run time. */
    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)]
    private string $outstandingSnapshot = '0.00';

    /** Max days past due at run time — drives the classification. */
    #[ORM\Column(type: 'integer')]
    private int $daysOverdueSnapshot = 0;

    /** 'substandard' | 'doubtful' | 'lost' */
    #[ORM\Column(type: 'string', length: 20)]
    private string $classification;

    /** Decimal rate, e.g. 0.10, 0.50, 1.00 */
    #[ORM\Column(type: 'decimal', precision: 5, scale: 4)]
    private string $provisionRate;

    /** outstanding × rate at run time — the FULL provision required. */
    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)]
    private string $provisionAmountRequired = '0.00';

    /** What was carried from the prior non-reversed run for this loan
     *  (0 if this is the loan's first time in a provision run). */
    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)]
    private string $priorProvisionAmount = '0.00';

    /** Delta posted this run (required − prior). Can be negative. */
    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)]
    private string $deltaAmount = '0.00';

    public function __construct() { $this->id = Uuid::uuid4()->toString(); }

    public function getId(): string { return $this->id; }
    public function getRun(): ProvisionRun { return $this->run; }
    public function setRun(ProvisionRun $v): void { $this->run = $v; }
    public function getLoan(): Loan { return $this->loan; }
    public function setLoan(Loan $v): void { $this->loan = $v; }
    public function getApplicationIdSnapshot(): string { return $this->applicationIdSnapshot; }
    public function setApplicationIdSnapshot(string $v): void { $this->applicationIdSnapshot = $v; }
    public function getOutstandingSnapshot(): string { return $this->outstandingSnapshot; }
    public function setOutstandingSnapshot(string $v): void { $this->outstandingSnapshot = $v; }
    public function getDaysOverdueSnapshot(): int { return $this->daysOverdueSnapshot; }
    public function setDaysOverdueSnapshot(int $v): void { $this->daysOverdueSnapshot = $v; }
    public function getClassification(): string { return $this->classification; }
    public function setClassification(string $v): void { $this->classification = $v; }
    public function getProvisionRate(): string { return $this->provisionRate; }
    public function setProvisionRate(string $v): void { $this->provisionRate = $v; }
    public function getProvisionAmountRequired(): string { return $this->provisionAmountRequired; }
    public function setProvisionAmountRequired(string $v): void { $this->provisionAmountRequired = $v; }
    public function getPriorProvisionAmount(): string { return $this->priorProvisionAmount; }
    public function setPriorProvisionAmount(string $v): void { $this->priorProvisionAmount = $v; }
    public function getDeltaAmount(): string { return $this->deltaAmount; }
    public function setDeltaAmount(string $v): void { $this->deltaAmount = $v; }

    public function toArray(): array
    {
        return [
            'id'                        => $this->id,
            'run_id'                    => $this->run->getId(),
            'loan_id'                   => $this->loan->getId(),
            'application_id'            => $this->applicationIdSnapshot,
            'outstanding'               => $this->outstandingSnapshot,
            'days_overdue'              => $this->daysOverdueSnapshot,
            'classification'            => $this->classification,
            'provision_rate'            => $this->provisionRate,
            'provision_amount_required' => $this->provisionAmountRequired,
            'prior_provision_amount'    => $this->priorProvisionAmount,
            'delta_amount'              => $this->deltaAmount,
        ];
    }
}
