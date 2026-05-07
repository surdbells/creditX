<?php
declare(strict_types=1);
namespace App\Domain\Entity;

use App\Domain\Enum\TransactionType;
use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

#[ORM\Entity]
#[ORM\Table(name: 'ledger_transactions')]
#[ORM\Index(name: 'idx_lt_gl', columns: ['gl_id'])]
#[ORM\Index(name: 'idx_lt_customer_ledger', columns: ['customer_ledger_id'])]
#[ORM\Index(name: 'idx_lt_callback', columns: ['trans_callback'])]
#[ORM\Index(name: 'idx_lt_year_month', columns: ['trans_year', 'trans_month'])]
#[ORM\Index(name: 'idx_lt_posting_date', columns: ['posting_date'])]
#[ORM\HasLifecycleCallbacks]
class LedgerTransaction
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\ManyToOne(targetEntity: GeneralLedger::class)]
    #[ORM\JoinColumn(name: 'gl_id', referencedColumnName: 'id', nullable: false)]
    private GeneralLedger $generalLedger;

    #[ORM\ManyToOne(targetEntity: CustomerLedger::class)]
    #[ORM\JoinColumn(name: 'customer_ledger_id', referencedColumnName: 'id', nullable: true)]
    private ?CustomerLedger $customerLedger = null;

    /**
     * Phase-2.5 aggregate FK. Every line belongs to exactly one
     * JournalEntry header.
     *
     * Phase-2.5 sub-phase A: introduced as nullable.
     * Phase-2.5 sub-phase B: backfilled all historical lines.
     * Phase-2.5 sub-phase D.9: column ALTERed to NOT NULL on the DB.
     * Phase-2.5 hotfix (this change): mapping tightened to nullable: false
     *   so Doctrine's INSERT statement always includes the column,
     *   and the in-memory type matches the DB constraint.
     *
     * onDelete: CASCADE — deleting a JournalEntry header cascades to
     * its lines. Defense in depth: services must never delete journals,
     * but if it ever happens, orphan lines would corrupt the GL —
     * cascade ensures lines go with the header.
     *
     * Type changed from `?JournalEntry = null` to non-nullable. After
     * D.9, every line must have a header by DB constraint, so allowing
     * the in-memory state to be null was a footgun: stale Doctrine
     * metadata cache (from before sub-phase A) could produce INSERTs
     * that omitted the column entirely, falling through to the DB's
     * default (NULL) and tripping the NOT NULL constraint at the
     * wrong layer with an opaque error.
     *
     * Now: callers that don't set journalEntry get a typed-property
     * uninitialized error at the line-construction site, which is
     * loud and immediate. postJournal() always sets it; that's the
     * canonical path.
     */
    #[ORM\ManyToOne(targetEntity: JournalEntry::class)]
    #[ORM\JoinColumn(name: 'journal_entry_id', referencedColumnName: 'id', nullable: false, onDelete: 'CASCADE')]
    private JournalEntry $journalEntry;

    #[ORM\Column(type: 'string', length: 5, enumType: TransactionType::class)]
    private TransactionType $transType;

    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)]
    private string $transAmount;

    #[ORM\Column(type: 'string', length: 500)]
    private string $transNarration;

    #[ORM\Column(type: 'string', length: 50, nullable: true)]
    private ?string $transReference = null;

    /** Batch grouping key for related entries */
    #[ORM\Column(type: 'string', length: 50, nullable: true)]
    private ?string $transCallback = null;

    #[ORM\Column(type: 'string', length: 4)]
    private string $transYear;

    #[ORM\Column(type: 'string', length: 2)]
    private string $transMonth;

    #[ORM\Column(type: 'string', length: 2)]
    private string $transDay;

    /**
     * Postgres-generated date column derived from
     * trans_year/trans_month/trans_day. Read-only from the application
     * (insertable=false, updatable=false) — Postgres maintains it
     * automatically via:
     *
     *   GENERATED ALWAYS AS
     *     ((trans_year || '-' || trans_month || '-' || trans_day)::date)
     *   STORED
     *
     * Why this exists: every date-range report (Income Statement,
     * Balance Sheet, Trial Balance, Budget vs Actual, Period Close,
     * GL summary, ListJournalEntries) used to filter dates with
     *
     *   CONCAT(trans_year, '-', trans_month, '-', trans_day) >= :date
     *
     * which can't use any index — Postgres has to scan the whole
     * partition (or the whole table) to evaluate the expression. As
     * ledger_transactions grows past ~1M rows that pattern degrades
     * sharply.
     *
     * With posting_date + idx_lt_posting_date, the same range queries
     * become indexable — Postgres uses the b-tree to seek directly
     * to the start/end of the range. Phase-2 schema hardening
     * migrates every report query to use this column directly.
     *
     * The 3 string columns are KEPT (not dropped). They're still the
     * canonical write path, and dropping them would require an entity
     * refactor that's out of scope for Phase 2. Phase 2.5+ may
     * deprecate them after we've confirmed every consumer is on
     * posting_date.
     */
    #[ORM\Column(name: 'posting_date', type: 'date_immutable', insertable: false, updatable: false, nullable: true)]
    private ?\DateTimeImmutable $postingDate = null;

    #[ORM\Column(type: 'boolean', options: ['default' => false])]
    private bool $isRepayment = false;

    #[ORM\Column(type: 'string', length: 36, nullable: true)]
    private ?string $postedBy = null;

    /** For reversals — links to original transaction */
    #[ORM\Column(type: 'string', length: 36, nullable: true)]
    private ?string $reversalOfId = null;

    /**
     * Whether this entry was posted by PeriodCloseService as part
     * of a period-end closing journal (zeroing P&L accounts into
     * Retained Earnings).
     *
     * Date-range financial reports (Income Statement, Trial Balance)
     * filter `is_closing_entry = false` so a closed period still
     * shows the period's actual income/expense activity rather than
     * being silently cancelled out by the closing CRs/DRs.
     *
     * Default false; PeriodCloseService is the only writer that
     * sets this true. Backfilled to true for historical closing
     * entries via the migrate-closing-entries.php script.
     */
    #[ORM\Column(type: 'boolean', options: ['default' => false])]
    private bool $isClosingEntry = false;

    public function __construct()
    {
        $this->id = Uuid::uuid4()->toString();
        $this->transYear = date('Y');
        $this->transMonth = date('m');
        $this->transDay = date('d');
    }

    public function getId(): string { return $this->id; }
    public function getGeneralLedger(): GeneralLedger { return $this->generalLedger; }
    public function setGeneralLedger(GeneralLedger $v): void { $this->generalLedger = $v; }
    public function getCustomerLedger(): ?CustomerLedger { return $this->customerLedger; }
    public function setCustomerLedger(?CustomerLedger $v): void { $this->customerLedger = $v; }

    /**
     * Phase-2.5 aggregate accessor. After sub-phase D.9's NOT NULL
     * migration, every persisted line has a header by DB constraint
     * — the return type is non-nullable accordingly.
     *
     * In-memory lines that haven't been linked to a header yet (e.g.
     * partway through assembly, before postJournal sets the FK) will
     * raise a typed-property uninitialized error if this getter is
     * called. That's intentional: the assembly path is private to
     * postJournal, and external callers always see persisted lines.
     */
    public function getJournalEntry(): JournalEntry { return $this->journalEntry; }
    public function setJournalEntry(JournalEntry $v): void { $this->journalEntry = $v; }
    public function getTransType(): TransactionType { return $this->transType; }
    public function setTransType(TransactionType $v): void { $this->transType = $v; }
    public function getTransAmount(): string { return $this->transAmount; }
    public function setTransAmount(string $v): void { $this->transAmount = $v; }
    public function getTransNarration(): string { return $this->transNarration; }
    public function setTransNarration(string $v): void { $this->transNarration = $v; }
    public function getTransReference(): ?string { return $this->transReference; }
    public function setTransReference(?string $v): void { $this->transReference = $v; }
    public function getTransCallback(): ?string { return $this->transCallback; }
    public function setTransCallback(?string $v): void { $this->transCallback = $v; }
    public function getTransYear(): string { return $this->transYear; }
    public function getTransMonth(): string { return $this->transMonth; }
    public function getTransDay(): string { return $this->transDay; }
    public function setTransDate(string $year, string $month, string $day): void
    {
        $this->transYear = $year;
        $this->transMonth = str_pad($month, 2, '0', STR_PAD_LEFT);
        $this->transDay = str_pad($day, 2, '0', STR_PAD_LEFT);
    }

    /**
     * Read-only access to the Postgres-generated posting_date column.
     * Returns null only on freshly-instantiated (not-yet-flushed)
     * entities — once the row has been persisted and re-fetched, the
     * generated value is populated. Callers that need the date before
     * flush should build it from getTransYear/Month/Day.
     */
    public function getPostingDate(): ?\DateTimeImmutable
    {
        return $this->postingDate;
    }
    public function isRepayment(): bool { return $this->isRepayment; }
    public function setIsRepayment(bool $v): void { $this->isRepayment = $v; }
    public function getPostedBy(): ?string { return $this->postedBy; }
    public function setPostedBy(?string $v): void { $this->postedBy = $v; }
    public function getReversalOfId(): ?string { return $this->reversalOfId; }
    public function setReversalOfId(?string $v): void { $this->reversalOfId = $v; }
    public function isClosingEntry(): bool { return $this->isClosingEntry; }
    public function setIsClosingEntry(bool $v): void { $this->isClosingEntry = $v; }

    public function toArray(): array
    {
        return [
            'id'                 => $this->id,
            'journal_entry_id'   => $this->journalEntry?->getId(),
            'gl_id'              => $this->generalLedger->getId(),
            'gl_name'            => $this->generalLedger->getAccountName(),
            'gl_code'            => $this->generalLedger->getAccountCode(),
            'customer_ledger_id' => $this->customerLedger?->getId(),
            'customer_ledger_no' => $this->customerLedger?->getAccountNumber(),
            'trans_type'         => $this->transType->value,
            'trans_amount'       => $this->transAmount,
            'trans_narration'    => $this->transNarration,
            'trans_reference'    => $this->transReference,
            'trans_callback'     => $this->transCallback,
            'trans_date'         => "{$this->transYear}-{$this->transMonth}-{$this->transDay}",
            'is_repayment'       => $this->isRepayment,
            'is_closing_entry'   => $this->isClosingEntry,
            'posted_by'          => $this->postedBy,
            'reversal_of_id'     => $this->reversalOfId,
            'created_at'         => $this->createdAt->format('Y-m-d H:i:s'),
        ];
    }
}
