<?php
declare(strict_types=1);
namespace App\Infrastructure\Service;

use App\Domain\Entity\LedgerTransaction;
use App\Domain\Entity\User;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Enrich serialised ledger-transaction arrays with fields that
 * require cross-entity lookups:
 *
 *   - posted_by_name     (User.fullName for posted_by user_id)
 *   - reversed_by_name   (User.fullName for the user who reversed
 *                         THIS entry — found via
 *                         LedgerTransaction.reversal_of_id pointing at us)
 *   - reversed_at        (createdAt of the reversal entry)
 *   - reversal_status    'normal' | 'reversed' | 'reversal'
 *
 * Keeping the enrichment out of LedgerTransaction::toArray() because
 * that entity method shouldn't do DB lookups for every single row
 * (N+1 death). Batching happens here: one user fetch + one reversal
 * fetch per list, regardless of row count.
 *
 * Usage:
 *
 *   $items = array_map(fn(\$t) => \$t->toArray(), \$transactions);
 *   \$items = \$enricher->enrich(\$items);
 *
 * Safe on an empty list (returns early).
 */
final class LedgerTransactionEnricher
{
    public function __construct(
        private readonly EntityManagerInterface $em,
    ) {}

    /**
     * @param list<array<string,mixed>> $items  Arrays from LedgerTransaction::toArray()
     * @return list<array<string,mixed>>
     */
    public function enrich(array $items): array
    {
        if (count($items) === 0) return $items;

        // ─── Collect user IDs to resolve ───
        // posted_by on every item + reversed_by (resolved below)
        $postedByIds = [];
        $txIds = [];
        foreach ($items as $it) {
            if (!empty($it['posted_by'])) {
                $postedByIds[(string) $it['posted_by']] = true;
            }
            if (!empty($it['id'])) {
                $txIds[] = (string) $it['id'];
            }
        }

        // ─── Find reversals pointing at THIS item list ───
        // Batch query: any ledger_transactions whose reversal_of_id is
        // in our set. Each result tells us (a) the original was reversed,
        // (b) by whom, (c) when.
        $reversalsByOriginalId = [];
        if (count($txIds) > 0) {
            $rows = $this->em->getConnection()->executeQuery(
                'SELECT reversal_of_id, posted_by, created_at
                 FROM ledger_transactions
                 WHERE reversal_of_id IS NOT NULL
                   AND reversal_of_id IN (?)',
                [$txIds],
                [\Doctrine\DBAL\ArrayParameterType::STRING],
            )->fetchAllAssociative();

            foreach ($rows as $row) {
                $reversalsByOriginalId[(string) $row['reversal_of_id']] = [
                    'posted_by' => $row['posted_by'],
                    'created_at' => $row['created_at'],
                ];
                if (!empty($row['posted_by'])) {
                    $postedByIds[(string) $row['posted_by']] = true;
                }
            }
        }

        // ─── Batch-load users ───
        $userNames = [];
        if (count($postedByIds) > 0) {
            $users = $this->em->createQueryBuilder()
                ->select('u')
                ->from(User::class, 'u')
                ->where('u.id IN (:ids)')
                ->setParameter('ids', array_keys($postedByIds))
                ->getQuery()->getResult();
            foreach ($users as $user) {
                /** @var User $user */
                $userNames[$user->getId()] = $user->getFullName();
            }
        }

        // ─── Annotate every item ───
        foreach ($items as &$it) {
            $postedById = $it['posted_by'] ?? null;
            $it['posted_by_name'] = $postedById
                ? ($userNames[(string) $postedById] ?? null)
                : null;

            // reversal_status:
            //   'reversal' — this IS a reversal (reversal_of_id set)
            //   'reversed' — this WAS reversed (someone points at us)
            //   'normal'   — neither
            if (!empty($it['reversal_of_id'])) {
                $it['reversal_status'] = 'reversal';
                $it['reversed_by_name'] = null;
                $it['reversed_at'] = null;
            } elseif (!empty($it['id']) && isset($reversalsByOriginalId[(string) $it['id']])) {
                $rev = $reversalsByOriginalId[(string) $it['id']];
                $it['reversal_status'] = 'reversed';
                $it['reversed_by'] = $rev['posted_by'];
                $it['reversed_by_name'] = $rev['posted_by']
                    ? ($userNames[(string) $rev['posted_by']] ?? null)
                    : null;
                $it['reversed_at'] = $rev['created_at'];
            } else {
                $it['reversal_status'] = 'normal';
                $it['reversed_by_name'] = null;
                $it['reversed_at'] = null;
            }
        }
        unset($it);

        return $items;
    }
}
