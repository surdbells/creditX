<?php
declare(strict_types=1);
namespace App\Domain\Entity;

use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

/**
 * BankReconciliation — one reconciliation session for a bank/cash GL
 * account as of a statement date.
 *
 * Reconciles the bank's statement closing balance against the GL book
 * balance, explaining the difference via unmatched (outstanding) items on
 * either side:
 *   - statement lines with no GL entry (e.g. bank charges not yet booked)
 *   - GL entries not on the statement (e.g. uncleared lodgements/cheques)
 *
 * Matching links each imported statement line to a BANK-GL ledger
 * transaction; the residual is the reconciling difference.
 */
#[ORM\Entity]
#[ORM\Table(name: 'bank_reconciliations')]
#[ORM\Index(name: 'idx_bankrec_gl_date', columns: ['gl_id', 'statement_date'])]
#[ORM\HasLifecycleCallbacks]
class BankReconciliation
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    /** The bank/cash GL account being reconciled (e.g. BANK). */
    #[ORM\Column(name: 'gl_id', type: 'string', length: 36)]
    private string $glId;

    #[ORM\Column(name: 'gl_code', type: 'string', length: 20)]
    private string $glCode;

    // date_immutable, matching the rest of the accounting module (JournalEntry,
    // LedgerTransaction). The service assigns DateTimeImmutable; the mutable
    // 'date' type's DBAL converter rejects it at flush time.
    #[ORM\Column(type: 'date_immutable')]
    private \DateTimeImmutable $statementDate;

    /** Bank-statement opening/closing balances (operator-entered). */
    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)]
    private string $openingBalance = '0.00';

    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)]
    private string $closingBalance = '0.00';

    /** 'draft' while matching, 'completed' once signed off. */
    #[ORM\Column(type: 'string', length: 20)]
    private string $status = 'draft';

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $notes = null;

    #[ORM\Column(type: 'string', length: 36, nullable: true)]
    private ?string $createdBy = null;

    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $completedAt = null;

    #[ORM\Column(type: 'string', length: 36, nullable: true)]
    private ?string $completedBy = null;

    /** @var Collection<int, BankStatementLine> */
    #[ORM\OneToMany(targetEntity: BankStatementLine::class, mappedBy: 'reconciliation', cascade: ['persist', 'remove'], orphanRemoval: true)]
    private Collection $lines;

    public function __construct()
    {
        $this->id = Uuid::uuid4()->toString();
        $this->lines = new ArrayCollection();
    }

    public function getId(): string { return $this->id; }
    public function getGlId(): string { return $this->glId; }
    public function setGlId(string $v): void { $this->glId = $v; }
    public function getGlCode(): string { return $this->glCode; }
    public function setGlCode(string $v): void { $this->glCode = $v; }
    public function getStatementDate(): \DateTimeImmutable { return $this->statementDate; }
    public function setStatementDate(\DateTimeImmutable $v): void { $this->statementDate = $v; }
    public function getOpeningBalance(): string { return $this->openingBalance; }
    public function setOpeningBalance(string $v): void { $this->openingBalance = $v; }
    public function getClosingBalance(): string { return $this->closingBalance; }
    public function setClosingBalance(string $v): void { $this->closingBalance = $v; }
    public function getStatus(): string { return $this->status; }
    public function setStatus(string $v): void { $this->status = $v; }
    public function getNotes(): ?string { return $this->notes; }
    public function setNotes(?string $v): void { $this->notes = $v; }
    public function getCreatedBy(): ?string { return $this->createdBy; }
    public function setCreatedBy(?string $v): void { $this->createdBy = $v; }
    public function getCompletedAt(): ?\DateTimeImmutable { return $this->completedAt; }
    public function setCompletedAt(?\DateTimeImmutable $v): void { $this->completedAt = $v; }
    public function getCompletedBy(): ?string { return $this->completedBy; }
    public function setCompletedBy(?string $v): void { $this->completedBy = $v; }

    /** @return Collection<int, BankStatementLine> */
    public function getLines(): Collection { return $this->lines; }
    public function addLine(BankStatementLine $line): void
    {
        $line->setReconciliation($this);
        $this->lines->add($line);
    }

    public function toArray(bool $includeLines = false): array
    {
        $data = [
            'id'              => $this->id,
            'gl_id'           => $this->glId,
            'gl_code'         => $this->glCode,
            'statement_date'  => $this->statementDate->format('Y-m-d'),
            'opening_balance' => $this->openingBalance,
            'closing_balance' => $this->closingBalance,
            'status'          => $this->status,
            'notes'           => $this->notes,
            'created_by'      => $this->createdBy,
            'created_at'      => $this->createdAt->format('Y-m-d H:i:s'),
            'completed_at'    => $this->completedAt?->format('Y-m-d H:i:s'),
            'line_count'      => $this->lines->count(),
        ];
        if ($includeLines) {
            $data['lines'] = $this->lines->map(fn(BankStatementLine $l) => $l->toArray())->toArray();
        }
        return $data;
    }
}
