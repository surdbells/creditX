<?php
declare(strict_types=1);
namespace App\Domain\Repository;

use App\Domain\Entity\JournalEntry;
use App\Domain\Entity\LedgerTransaction;
use App\Domain\Enum\JournalEntryType;

/**
 * Repository for the JournalEntry aggregate (Phase-2.5).
 *
 * The JournalEntry header replaces the soft-link "lines share a
 * trans_callback string" model with a proper FK aggregate. This
 * repository encapsulates the queries that the new
 * /api/accounting/journals endpoints need.
 *
 * Naming convention: the URL path uses 'journals' (the conceptual
 * unit — a balanced batch of postings) while the entity is
 * 'JournalEntry' (the technical name for the aggregate root).
 * Both refer to the same thing.
 */
class JournalEntryRepository extends BaseRepository
{
    protected function getEntityClass(): string
    {
        return JournalEntry::class;
    }

    /**
     * Paginated list of journal entries with optional filters.
     *
     * Filters (all optional, AND-combined):
     *   entryType         JournalEntryType enum or its string value
     *   postingDateFrom   inclusive lower bound on posting_date
     *   postingDateTo     inclusive upper bound on posting_date
     *   includeReversals  if false (default), excludes is_reversal=true
     *                     entries from results — for the default "show me
     *                     business activity" view. Set true to include
     *                     reversal journals (audit / forensic view).
     *   includeClosing    if false (default), excludes is_closing_entry
     *                     entries — for the "what business activity
     *                     happened" view that doesn't want closing
     *                     bookkeeping. Set true to include them.
     *   search            substring match on narration / reference /
     *                     legacy_callback (case-insensitive)
     *
     * @return array{items: JournalEntry[], total: int}
     */
    public function paginated(
        int $offset,
        int $limit,
        ?JournalEntryType $entryType = null,
        ?string $postingDateFrom = null,
        ?string $postingDateTo = null,
        bool $includeReversals = false,
        bool $includeClosing = false,
        ?string $search = null,
        string $sortBy = 'postingDate',
        string $sortDir = 'DESC',
    ): array {
        $qb = $this->em->createQueryBuilder()
            ->select('je')
            ->from(JournalEntry::class, 'je');

        if ($entryType !== null) {
            $qb->andWhere('je.entryType = :et')
               ->setParameter('et', $entryType);
        }
        if ($postingDateFrom !== null && $postingDateFrom !== '') {
            $qb->andWhere('je.postingDate >= :pdFrom')
               ->setParameter('pdFrom', new \DateTimeImmutable($postingDateFrom));
        }
        if ($postingDateTo !== null && $postingDateTo !== '') {
            $qb->andWhere('je.postingDate <= :pdTo')
               ->setParameter('pdTo', new \DateTimeImmutable($postingDateTo));
        }
        if (! $includeReversals) {
            $qb->andWhere('je.isReversal = :rev')
               ->setParameter('rev', false);
        }
        if (! $includeClosing) {
            $qb->andWhere('je.isClosingEntry = :cl')
               ->setParameter('cl', false);
        }
        if ($search !== null && trim($search) !== '') {
            $qb->andWhere($qb->expr()->orX(
                $qb->expr()->like('LOWER(je.narration)', ':search'),
                $qb->expr()->like('LOWER(je.reference)', ':search'),
                $qb->expr()->like('LOWER(je.legacyCallback)', ':search'),
            ))->setParameter('search', '%' . strtolower(trim($search)) . '%');
        }

        // Total before applying pagination.
        $countQb = clone $qb;
        $total = (int) $countQb->select('COUNT(je.id)')
            ->resetDQLPart('orderBy')
            ->getQuery()->getSingleScalarResult();

        // Whitelist sortable fields.
        $allowedSort = ['postingDate', 'createdAt', 'entryType'];
        if (! in_array($sortBy, $allowedSort, true)) {
            $sortBy = 'postingDate';
        }
        $sortDir = strtoupper($sortDir);
        if (! in_array($sortDir, ['ASC', 'DESC'], true)) {
            $sortDir = 'DESC';
        }

        // Secondary sort on createdAt DESC ensures stable ordering when
        // multiple journals share a posting_date — the natural browse
        // order is then "newest journal of the day first".
        $qb->orderBy("je.{$sortBy}", $sortDir);
        if ($sortBy !== 'createdAt') {
            $qb->addOrderBy('je.createdAt', 'DESC');
        }
        $qb->setFirstResult($offset)->setMaxResults($limit);

        return [
            'items' => $qb->getQuery()->getResult(),
            'total' => $total,
        ];
    }

    /**
     * Fetch the lines for a journal entry, ordered DR-first then by
     * creation order. The DR-first convention mirrors how accountants
     * read journals on paper (debits above credits).
     *
     * @return LedgerTransaction[]
     */
    public function getLines(JournalEntry $journal): array
    {
        return $this->em->createQueryBuilder()
            ->select('lt')
            ->from(LedgerTransaction::class, 'lt')
            ->where('lt.journalEntry = :je')
            ->setParameter('je', $journal)
            // DR before CR. 'DR' > 'CR' alphabetically, so DESC sort
            // puts DR first — matches how accountants read journals
            // on paper (debits above credits). Then secondary sort by
            // createdAt for stable ordering within each side.
            ->orderBy('lt.transType', 'DESC')
            ->addOrderBy('lt.createdAt', 'ASC')
            ->getQuery()->getResult();
    }

    /**
     * Find any reversal journal that points at this header. Returns
     * the reversal JournalEntry or null.
     *
     * Used by the detail endpoint to surface "this journal was
     * reversed" without needing the frontend to make a separate
     * lookup.
     */
    public function findReversal(JournalEntry $original): ?JournalEntry
    {
        return $this->em->createQueryBuilder()
            ->select('je')
            ->from(JournalEntry::class, 'je')
            ->where('je.reversalOfId = :oid')
            ->setParameter('oid', $original->getId())
            ->setMaxResults(1)
            ->getQuery()->getOneOrNullResult();
    }
}
