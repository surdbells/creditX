<?php
declare(strict_types=1);
namespace App\Infrastructure\Service;

use App\Domain\Entity\BankReconciliation;
use App\Domain\Entity\BankStatementLine;
use App\Domain\Entity\GeneralLedger;
use App\Domain\Exception\DomainException;
use Doctrine\ORM\EntityManagerInterface;

/**
 * BankReconciliationService — import a bank statement, match its lines to
 * BANK-GL ledger transactions, and report the reconciling difference.
 *
 * Sign convention (see BankStatementLine): statement `amount` is positive
 * for money INTO the account (a bank credit → a ledger DR on the bank GL)
 * and negative for money OUT (a ledger CR). Matching pairs a statement line
 * with a ledger transaction of equal signed amount near the same date.
 *
 * The summary reconciles:
 *   book balance (GL, as of statement date)
 *     − deposits in transit / unpresented items (unmatched GL entries)
 *     + statement-only items (unmatched statement lines, e.g. bank charges)
 *   = statement closing balance      (difference should resolve to zero)
 */
final class BankReconciliationService
{
    private const MATCH_DATE_WINDOW_DAYS = 7;

    public function __construct(
        private readonly EntityManagerInterface $em,
    ) {}

    public function create(string $glCode, string $statementDate, string $opening, string $closing, ?string $userId): BankReconciliation
    {
        $this->assertDate($statementDate);
        $gl = $this->em->getRepository(GeneralLedger::class)->findOneBy(['accountCode' => $glCode]);
        if ($gl === null) {
            throw new DomainException("GL account '{$glCode}' not found");
        }

        $rec = new BankReconciliation();
        $rec->setGlId($gl->getId());
        $rec->setGlCode($gl->getAccountCode());
        $rec->setStatementDate(new \DateTimeImmutable($statementDate));
        $rec->setOpeningBalance($this->money($opening));
        $rec->setClosingBalance($this->money($closing));
        $rec->setCreatedBy($userId);
        $this->em->persist($rec);
        $this->em->flush();
        return $rec;
    }

    /**
     * Import statement rows. Each row: {value_date, description, reference?, amount}
     * where amount is signed (+in / -out).
     *
     * @param array<int, array> $rows
     */
    public function importLines(string $reconId, array $rows): BankReconciliation
    {
        $rec = $this->get($reconId);
        if ($rec->getStatus() === 'completed') {
            throw new DomainException('Reconciliation is completed — cannot import more lines');
        }
        $imported = 0;
        foreach ($rows as $row) {
            $date = trim((string) ($row['value_date'] ?? ''));
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
                continue; // skip rows without a usable date
            }
            if (!isset($row['amount']) || !is_numeric($row['amount']) || (float) $row['amount'] == 0.0) {
                continue;
            }
            $line = new BankStatementLine();
            $line->setValueDate(new \DateTimeImmutable($date));
            $line->setDescription((string) ($row['description'] ?? ''));
            $line->setReference(isset($row['reference']) && $row['reference'] !== '' ? (string) $row['reference'] : null);
            $line->setAmount($this->money((string) $row['amount']));
            $rec->addLine($line);
            $this->em->persist($line);
            $imported++;
        }
        $this->em->flush();
        return $rec;
    }

    /**
     * Greedily auto-match unmatched statement lines to BANK-GL ledger
     * transactions of equal signed amount within a date window. A ledger
     * transaction is used at most once per reconciliation.
     *
     * @return array{matched: int, remaining: int}
     */
    public function autoMatch(string $reconId): array
    {
        $rec = $this->get($reconId);
        $used = $this->matchedLedgerIds($rec);

        // Candidate ledger entries on the bank GL up to the statement date.
        $candidates = $this->bankLedgerEntries($rec, $rec->getStatementDate()->format('Y-m-d'));

        $matched = 0;
        foreach ($rec->getLines() as $line) {
            if ($line->isMatched() || $line->getStatus() === 'ignored') continue;
            $lineDate = $line->getValueDate()->format('Y-m-d');
            $best = null; $bestDelta = null;
            foreach ($candidates as $c) {
                if (isset($used[$c['id']])) continue;
                if (bccomp($c['signed'], $line->getAmount(), 2) !== 0) continue;
                $delta = abs($this->dayDiff($lineDate, $c['date']));
                if ($delta > self::MATCH_DATE_WINDOW_DAYS) continue;
                if ($bestDelta === null || $delta < $bestDelta) { $best = $c; $bestDelta = $delta; }
            }
            if ($best !== null) {
                $line->setStatus('matched');
                $line->setMatchedLedgerTransactionId($best['id']);
                $used[$best['id']] = true;
                $matched++;
            }
        }
        $this->em->flush();

        $remaining = 0;
        foreach ($rec->getLines() as $l) {
            if ($l->getStatus() === 'unmatched') $remaining++;
        }
        return ['matched' => $matched, 'remaining' => $remaining];
    }

    public function matchLine(string $reconId, string $lineId, string $ledgerTxnId): BankStatementLine
    {
        $rec = $this->get($reconId);
        $line = $this->lineOf($rec, $lineId);
        $used = $this->matchedLedgerIds($rec);
        if (isset($used[$ledgerTxnId])) {
            throw new DomainException('That ledger transaction is already matched in this reconciliation');
        }
        $line->setStatus('matched');
        $line->setMatchedLedgerTransactionId($ledgerTxnId);
        $this->em->flush();
        return $line;
    }

    public function unmatchLine(string $reconId, string $lineId): BankStatementLine
    {
        $rec = $this->get($reconId);
        $line = $this->lineOf($rec, $lineId);
        $line->setStatus('unmatched');
        $line->setMatchedLedgerTransactionId(null);
        $this->em->flush();
        return $line;
    }

    public function complete(string $reconId, ?string $userId): BankReconciliation
    {
        $rec = $this->get($reconId);
        $rec->setStatus('completed');
        $rec->setCompletedAt(new \DateTimeImmutable());
        $rec->setCompletedBy($userId);
        $this->em->flush();
        return $rec;
    }

    /**
     * Full reconciliation view: the session, its lines, the unmatched book
     * (GL) entries, and the reconciliation arithmetic.
     */
    public function summary(string $reconId): array
    {
        $rec = $this->get($reconId);
        $asOf = $rec->getStatementDate()->format('Y-m-d');

        $bookBalance = $this->bankBookBalance($rec->getGlId(), $asOf);
        $entries = $this->bankLedgerEntries($rec, $asOf);
        $used = $this->matchedLedgerIds($rec);

        // Unmatched GL entries — in the books but not (yet) on the statement.
        $unmatchedBook = [];
        $unmatchedBookTotal = '0.00';
        foreach ($entries as $e) {
            if (isset($used[$e['id']])) continue;
            $unmatchedBook[] = $e;
            $unmatchedBookTotal = bcadd($unmatchedBookTotal, $e['signed'], 2);
        }

        // Unmatched statement lines — on the statement but not in the books.
        $unmatchedStmtTotal = '0.00';
        $lines = [];
        foreach ($rec->getLines() as $l) {
            $lines[] = $l->toArray();
            if ($l->getStatus() === 'unmatched') {
                $unmatchedStmtTotal = bcadd($unmatchedStmtTotal, $l->getAmount(), 2);
            }
        }

        // Adjusted book balance should equal the statement closing balance
        // once every reconciling item is accounted for:
        //   statement_closing = book − unmatched_book + unmatched_statement
        $expectedClosing = bcadd(bcsub($bookBalance, $unmatchedBookTotal, 2), $unmatchedStmtTotal, 2);
        $difference = bcsub($rec->getClosingBalance(), $expectedClosing, 2);

        return [
            'reconciliation'        => $rec->toArray(false),
            'lines'                 => $lines,
            'unmatched_book'        => $unmatchedBook,
            'summary'               => [
                'book_balance'            => $bookBalance,
                'statement_closing'       => $rec->getClosingBalance(),
                'unmatched_book_total'    => $unmatchedBookTotal,
                'unmatched_statement_total' => $unmatchedStmtTotal,
                'expected_closing'        => $expectedClosing,
                'difference'              => $difference,
                'is_reconciled'           => bccomp($this->abs($difference), '0.01', 2) <= 0,
            ],
        ];
    }

    // ─── internal helpers ──────────────────────────────────────────

    private function get(string $reconId): BankReconciliation
    {
        $rec = $this->em->find(BankReconciliation::class, $reconId);
        if ($rec === null) {
            throw new DomainException('Reconciliation not found');
        }
        return $rec;
    }

    private function lineOf(BankReconciliation $rec, string $lineId): BankStatementLine
    {
        foreach ($rec->getLines() as $l) {
            if ($l->getId() === $lineId) return $l;
        }
        throw new DomainException('Statement line not found in this reconciliation');
    }

    /** @return array<string, bool> set of ledger txn ids already matched here */
    private function matchedLedgerIds(BankReconciliation $rec): array
    {
        $out = [];
        foreach ($rec->getLines() as $l) {
            if ($l->isMatched() && $l->getMatchedLedgerTransactionId() !== null) {
                $out[$l->getMatchedLedgerTransactionId()] = true;
            }
        }
        return $out;
    }

    /**
     * Bank GL ledger entries up to a date, each with a signed amount in
     * statement terms (DR = +in, CR = -out).
     *
     * @return array<int, array{id:string, date:string, signed:string, narration:string, reference:?string}>
     */
    private function bankLedgerEntries(BankReconciliation $rec, string $asOf): array
    {
        $conn = $this->em->getConnection();
        $sql = "
            SELECT id, trans_type, trans_amount, posting_date, trans_narration, trans_reference
            FROM ledger_transactions
            WHERE gl_id = :glId AND posting_date <= :asOf::date
            ORDER BY posting_date ASC, created_at ASC
        ";
        $rows = $conn->executeQuery($sql, ['glId' => $rec->getGlId(), 'asOf' => $asOf])->fetchAllAssociative();
        $out = [];
        foreach ($rows as $r) {
            $amt = $this->money((string) $r['trans_amount']);
            $signed = $r['trans_type'] === 'DR' ? $amt : '-' . $amt;
            $out[] = [
                'id'        => $r['id'],
                'date'      => substr((string) $r['posting_date'], 0, 10),
                'signed'    => $this->money($signed),
                'narration' => (string) ($r['trans_narration'] ?? ''),
                'reference' => $r['trans_reference'] ?? null,
            ];
        }
        return $out;
    }

    /** Book balance of the bank GL as of a date: sum(DR) − sum(CR). */
    private function bankBookBalance(string $glId, string $asOf): string
    {
        $conn = $this->em->getConnection();
        $sql = "
            SELECT
                COALESCE(SUM(CASE WHEN trans_type='DR' THEN CAST(trans_amount AS NUMERIC) ELSE 0 END), 0) AS dr,
                COALESCE(SUM(CASE WHEN trans_type='CR' THEN CAST(trans_amount AS NUMERIC) ELSE 0 END), 0) AS cr
            FROM ledger_transactions
            WHERE gl_id = :glId AND posting_date <= :asOf::date
        ";
        $r = $conn->executeQuery($sql, ['glId' => $glId, 'asOf' => $asOf])->fetchAssociative();
        return bcsub($this->money((string) ($r['dr'] ?? '0')), $this->money((string) ($r['cr'] ?? '0')), 2);
    }

    private function dayDiff(string $a, string $b): int
    {
        return (int) ((new \DateTimeImmutable($a))->diff(new \DateTimeImmutable($b))->days)
            * (((new \DateTimeImmutable($a)) <= (new \DateTimeImmutable($b))) ? 1 : -1);
    }

    private function money(string $v): string
    {
        return number_format((float) $v, 2, '.', '');
    }

    private function abs(string $n): string
    {
        return str_starts_with($n, '-') ? substr($n, 1) : $n;
    }

    private function assertDate(string $d): void
    {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) {
            throw new DomainException('Invalid date — expected YYYY-MM-DD');
        }
    }
}
