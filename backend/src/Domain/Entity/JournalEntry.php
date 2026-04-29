<?php
declare(strict_types=1);
namespace App\Domain\Entity;

use App\Domain\Enum\JournalEntryType;
use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

/**
 * JournalEntry — header for a balanced set of LedgerTransaction lines.
 *
 * Phase-2.5 introduces this aggregate to replace the prior soft-link
 * model where a "batch" of lines was identified only by sharing a
 * trans_callback string. Now: one JournalEntry header (this entity)
 * has many LedgerTransaction lines via journal_entry_id FK.
 *
 * Why:
 *   - DB-level integrity (FK guarantees lines can't outlive their header,
 *     and metadata lives in one place rather than denormalized across N lines)
 *   - Conventional schema auditors recognize on sight (no need to explain
 *     "we batch by string-matching a callback column")
 *   - Foundation for future work: reversal chains, journal templates,
 *     header-level approval workflow, etc.
 *
 * Phase-2.5 sub-phase A (this commit): scaffold the entity + table only.
 * No service uses it yet. journal_entry_id on LedgerTransaction is nullable
 * for now — it gets populated in sub-phase B (backfill) and made NOT NULL
 * in sub-phase C.
 *
 * ─── Field design notes ─────────────────────────────────────────────
 *
 * posting_date: the effective date for the entire journal. All lines
 *   share this date — a single journal cannot span multiple posting
 *   dates by design (reflects the accounting principle that each
 *   business event has one effective date).
 *
 * entry_type: high-level classification (DISBURSEMENT, REPAYMENT, etc.)
 *   See JournalEntryType for the full list and rationale.
 *
 * is_reversal + reversal_of_id: when this journal reverses another,
 *   is_reversal=true and reversal_of_id points to the original
 *   journal's id. Allows traversing reversal chains without joining
 *   through ledger_transactions.
 *
 * is_closing_entry: denormalized to the header from the lines per the
 *   Phase-2.5 Q2c decision. Lines also carry the flag (existing
 *   schema, kept for backward compat with IS/Trial Balance queries).
 *   Phase-2.5b cleanup may drop the line column once we've confirmed
 *   the header is the canonical source.
 *
 * legacy_callback: preserves the old trans_callback string on the
 *   header for traceability during migration (sub-phase B uses this
 *   to group historical lines into headers). Will be dropped once
 *   sub-phase E confirms no consumer reads it.
 *
 * reference: external reference (e.g. payment reference, batch ID).
 *   Useful for cross-system reconciliation — separate from
 *   trans_reference on lines (which is line-specific, e.g. fee invoice
 *   number). Optional.
 */
#[ORM\Entity]
#[ORM\Table(name: 'journal_entries')]
#[ORM\Index(name: 'idx_je_posting_date', columns: ['posting_date'])]
#[ORM\Index(name: 'idx_je_entry_type', columns: ['entry_type'])]
#[ORM\Index(name: 'idx_je_reversal_of', columns: ['reversal_of_id'])]
#[ORM\Index(name: 'idx_je_legacy_callback', columns: ['legacy_callback'])]
#[ORM\HasLifecycleCallbacks]
class JournalEntry
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    /**
     * The effective posting date for every line in this journal.
     * Kept as date (not datetime) since accounting periods work at
     * day granularity. LedgerTransaction.posting_date (the generated
     * column from Phase 2) must equal this for every linked line.
     */
    #[ORM\Column(name: 'posting_date', type: 'date_immutable')]
    private \DateTimeImmutable $postingDate;

    #[ORM\Column(name: 'entry_type', type: 'string', length: 20, enumType: JournalEntryType::class)]
    private JournalEntryType $entryType;

    /**
     * Journal-level description. Distinct from per-line trans_narration
     * (which describes that specific DR or CR). Examples:
     *   - "Loan disbursement — APP-2026-00123"
     *   - "Period close — March 2026"
     *   - "Reversal: original journal posted in error"
     */
    #[ORM\Column(type: 'string', length: 500)]
    private string $narration;

    /**
     * Optional external reference for cross-system reconciliation
     * (e.g. payment provider transaction ID, batch ID). Distinct
     * from trans_reference on lines.
     */
    #[ORM\Column(type: 'string', length: 100, nullable: true)]
    private ?string $reference = null;

    /**
     * UUID of the user who posted this journal. Nullable because
     * scheduled jobs (overdue scan, period close from cron) may not
     * have a user context.
     */
    #[ORM\Column(name: 'posted_by', type: 'string', length: 36, nullable: true)]
    private ?string $postedBy = null;

    #[ORM\Column(name: 'is_reversal', type: 'boolean', options: ['default' => false])]
    private bool $isReversal = false;

    /**
     * When is_reversal=true, points to the original JournalEntry
     * being reversed. Allows traversing reversal chains without
     * joining through ledger_transactions.
     */
    #[ORM\Column(name: 'reversal_of_id', type: 'string', length: 36, nullable: true)]
    private ?string $reversalOfId = null;

    /**
     * Denormalized from line-level is_closing_entry per the Phase-2.5
     * Q2c decision. When true, this entire journal was emitted by
     * PeriodCloseService.
     */
    #[ORM\Column(name: 'is_closing_entry', type: 'boolean', options: ['default' => false])]
    private bool $isClosingEntry = false;

    /**
     * The original trans_callback string (e.g. 'DISB-APP-2026-00123-20260415120000').
     * Kept on the header through Phase 2.5 to:
     *   - allow sub-phase B's backfill to group existing lines correctly
     *   - support gradual migration of consumers that still read trans_callback
     *
     * Will be dropped in Phase 2.5b cleanup once every consumer is
     * confirmed migrated.
     */
    #[ORM\Column(name: 'legacy_callback', type: 'string', length: 100, nullable: true)]
    private ?string $legacyCallback = null;

    public function __construct()
    {
        $this->id = Uuid::uuid4()->toString();
    }

    public function getId(): string { return $this->id; }

    public function getPostingDate(): \DateTimeImmutable { return $this->postingDate; }
    public function setPostingDate(\DateTimeImmutable $v): void { $this->postingDate = $v; }

    public function getEntryType(): JournalEntryType { return $this->entryType; }
    public function setEntryType(JournalEntryType $v): void { $this->entryType = $v; }

    public function getNarration(): string { return $this->narration; }
    public function setNarration(string $v): void { $this->narration = $v; }

    public function getReference(): ?string { return $this->reference; }
    public function setReference(?string $v): void { $this->reference = $v; }

    public function getPostedBy(): ?string { return $this->postedBy; }
    public function setPostedBy(?string $v): void { $this->postedBy = $v; }

    public function isReversal(): bool { return $this->isReversal; }
    public function setIsReversal(bool $v): void { $this->isReversal = $v; }

    public function getReversalOfId(): ?string { return $this->reversalOfId; }
    public function setReversalOfId(?string $v): void { $this->reversalOfId = $v; }

    public function isClosingEntry(): bool { return $this->isClosingEntry; }
    public function setIsClosingEntry(bool $v): void { $this->isClosingEntry = $v; }

    public function getLegacyCallback(): ?string { return $this->legacyCallback; }
    public function setLegacyCallback(?string $v): void { $this->legacyCallback = $v; }

    public function toArray(): array
    {
        return [
            'id'                => $this->id,
            'posting_date'      => $this->postingDate->format('Y-m-d'),
            'entry_type'        => $this->entryType->value,
            'narration'         => $this->narration,
            'reference'         => $this->reference,
            'posted_by'         => $this->postedBy,
            'is_reversal'       => $this->isReversal,
            'reversal_of_id'    => $this->reversalOfId,
            'is_closing_entry'  => $this->isClosingEntry,
            'legacy_callback'   => $this->legacyCallback,
            'created_at'        => $this->createdAt->format('Y-m-d H:i:s'),
        ];
    }
}
