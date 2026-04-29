<?php

declare(strict_types=1);

namespace App\Domain\Entity;

use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

/**
 * GlReconciliationRun — historical record of a scheduled (or
 * manual) sub-ledger ↔ control-account reconciliation scan.
 *
 * Created by GlReconciliationService::runScheduled(). One row per
 * run. Used by ops/audit teams to:
 *   - Confirm the daily scan ran
 *   - See if discrepancies are growing or shrinking over time
 *   - Drill into a specific run's per-account details (stored as
 *     JSON in `details`)
 *
 * Indexed by started_at for the typical "show me recent runs"
 * query.
 *
 * Phase-2 schema-hardening addition. The HTTP /api/accounting/
 * reconciliation endpoint does not write to this table — only
 * scheduled runs do. Manual on-demand reports stay ephemeral.
 */
#[ORM\Entity]
#[ORM\Table(name: 'gl_reconciliation_runs')]
#[ORM\Index(name: 'idx_glr_started', columns: ['started_at'])]
#[ORM\HasLifecycleCallbacks]
class GlReconciliationRun
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\Column(type: 'datetime_immutable')]
    private \DateTimeImmutable $startedAt;

    #[ORM\Column(type: 'datetime_immutable')]
    private \DateTimeImmutable $completedAt;

    #[ORM\Column(type: 'integer')]
    private int $accountsChecked = 0;

    #[ORM\Column(type: 'integer')]
    private int $accountsWithDiscrepancy = 0;

    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)]
    private string $totalDiscrepancy = '0.00';

    /**
     * Per-account breakdown as JSON. Same shape as
     * GlReconciliationService::scan()['accounts'] entries:
     * id, code, name, parent_balance, subledger_balance,
     * combined_balance, has_discrepancy, discrepancy_amount, etc.
     *
     * Stored verbatim so an audit reviewer can reconstruct the
     * exact state at scan time even if subsequent postings have
     * since changed the accounts.
     *
     * @var array<int, array<string, mixed>>
     */
    #[ORM\Column(type: 'json')]
    private array $details = [];

    public function __construct()
    {
        $this->id = Uuid::uuid4()->toString();
    }

    public function getId(): string { return $this->id; }
    public function getStartedAt(): \DateTimeImmutable { return $this->startedAt; }
    public function setStartedAt(\DateTimeImmutable $v): void { $this->startedAt = $v; }
    public function getCompletedAt(): \DateTimeImmutable { return $this->completedAt; }
    public function setCompletedAt(\DateTimeImmutable $v): void { $this->completedAt = $v; }
    public function getAccountsChecked(): int { return $this->accountsChecked; }
    public function setAccountsChecked(int $v): void { $this->accountsChecked = $v; }
    public function getAccountsWithDiscrepancy(): int { return $this->accountsWithDiscrepancy; }
    public function setAccountsWithDiscrepancy(int $v): void { $this->accountsWithDiscrepancy = $v; }
    public function getTotalDiscrepancy(): string { return $this->totalDiscrepancy; }
    public function setTotalDiscrepancy(string $v): void { $this->totalDiscrepancy = $v; }
    public function getDetails(): array { return $this->details; }
    public function setDetails(array $v): void { $this->details = $v; }

    public function toArray(): array
    {
        return [
            'id'                          => $this->id,
            'started_at'                  => $this->startedAt->format('Y-m-d H:i:s'),
            'completed_at'                => $this->completedAt->format('Y-m-d H:i:s'),
            'accounts_checked'            => $this->accountsChecked,
            'accounts_with_discrepancy'   => $this->accountsWithDiscrepancy,
            'total_discrepancy'           => $this->totalDiscrepancy,
            'details'                     => $this->details,
            'created_at'                  => $this->createdAt->format('Y-m-d H:i:s'),
        ];
    }
}
