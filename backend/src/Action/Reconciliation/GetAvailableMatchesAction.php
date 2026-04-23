<?php
declare(strict_types=1);
namespace App\Action\Reconciliation;

use App\Domain\Entity\ReconciliationItem;
use App\Domain\Repository\ReconciliationRepository;
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GET /api/reconciliations/{id}/available-matches?item_id={itemId}
 *
 * Return candidate system ledger transactions that could plausibly
 * be the match for an unmatched bank-side reconciliation item. The
 * user picks one and POSTs to /manual-match.
 *
 * ## Candidate shortlist
 *
 * Scoped narrowly to avoid flooding the UI with irrelevant rows:
 *   - Transactions in the same period (trans_year + trans_month
 *     matching the reconciliation)
 *   - is_repayment = true AND trans_type = 'DR' — same filter the
 *     auto-matcher uses, keeps the pool consistent
 *   - Amount within ±1% of the bank amount (wider than the exact-
 *     match rule the service uses, to catch rounding or tiny bank
 *     fees stripped off the displayed figure)
 *   - NOT already matched to any other item in this reconciliation
 *     (via either auto-match system_reference or the new
 *     manual_match_tx_id field)
 *
 * Sorted by absolute-amount-difference ascending — the closest
 * matches float to the top.
 *
 * Maximum of 50 rows returned; the UI shouldn't ask the user to
 * scroll through more than that. If the right answer isn't in the
 * shortlist, the UX escape hatch is to use Resolve instead.
 *
 * Gated by reports.reconciliation.
 */
final class GetAvailableMatchesAction
{
    use ApiResponse;

    public function __construct(
        private readonly ReconciliationRepository $reconRepo,
        private readonly EntityManagerInterface $em,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $reconId = $args['id'] ?? '';
        $recon = $this->reconRepo->find($reconId);
        if ($recon === null) return $this->notFound('Reconciliation not found');

        $params = $request->getQueryParams();
        $itemId = (string) ($params['item_id'] ?? '');
        if ($itemId === '') return $this->validationError(['item_id' => 'Required']);

        /** @var ReconciliationItem|null $item */
        $item = $this->em->find(ReconciliationItem::class, $itemId);
        if ($item === null || $item->getReconciliation()->getId() !== $recon->getId()) {
            return $this->notFound('Item not found in this reconciliation');
        }
        if ($item->getBankAmount() === null) {
            return $this->error('Item has no bank amount — cannot search for candidates', 400);
        }

        $bankAmount = $item->getBankAmount();
        // ±1% tolerance. bcmath-based to avoid floating-point wobble
        // on large amounts.
        $tolerance = bcmul($bankAmount, '0.01', 2);
        $lo = bcsub($bankAmount, $tolerance, 2);
        $hi = bcadd($bankAmount, $tolerance, 2);

        $year = $recon->getPeriodYear();
        $month = $recon->getPeriodMonth();

        // Claimed references (auto-matched + manually-matched) so we
        // exclude them from the candidate list. Two separate fields
        // depending on how the auto-matcher recorded the pairing:
        //   - system_reference: set by auto-matcher on EXACT/PARTIAL
        //   - manual_match_tx_id: set by ManualMatchItemAction
        $claimedRefs = $this->em->createQueryBuilder()
            ->select('DISTINCT i.systemReference')
            ->from(ReconciliationItem::class, 'i')
            ->where('i.reconciliation = :r')
            ->andWhere('i.systemReference IS NOT NULL')
            ->setParameter('r', $recon)
            ->getQuery()->getSingleColumnResult();
        $claimedTxIds = $this->em->createQueryBuilder()
            ->select('DISTINCT i.manualMatchTxId')
            ->from(ReconciliationItem::class, 'i')
            ->where('i.reconciliation = :r')
            ->andWhere('i.manualMatchTxId IS NOT NULL')
            ->setParameter('r', $recon)
            ->getQuery()->getSingleColumnResult();

        $conn = $this->em->getConnection();

        // Raw SQL — we want the ORDER BY abs() trick and a hard LIMIT
        // which DQL handles awkwardly.
        $sql = "
            SELECT
                lt.id,
                lt.trans_reference,
                lt.trans_callback,
                lt.trans_amount,
                lt.trans_narration,
                (lt.trans_year || '-' || lt.trans_month || '-' || lt.trans_day) AS trans_date,
                ABS(CAST(lt.trans_amount AS NUMERIC) - CAST(:bank AS NUMERIC)) AS diff
            FROM ledger_transactions lt
            WHERE lt.trans_year = :y
              AND lt.trans_month = :m
              AND lt.is_repayment = true
              AND lt.trans_type = 'DR'
              AND CAST(lt.trans_amount AS NUMERIC) BETWEEN CAST(:lo AS NUMERIC) AND CAST(:hi AS NUMERIC)
        ";
        $bind = ['bank' => $bankAmount, 'y' => $year, 'm' => $month, 'lo' => $lo, 'hi' => $hi];

        // Exclude claimed references. Filter out any empty strings
        // that would turn the IN-clause into 'NOT IN (NULL)'.
        $claimedRefs = array_values(array_filter($claimedRefs, fn($r) => $r !== null && $r !== ''));
        $claimedTxIds = array_values(array_filter($claimedTxIds, fn($r) => $r !== null && $r !== ''));

        if (!empty($claimedRefs)) {
            $ph = [];
            foreach ($claimedRefs as $i => $ref) {
                $ph[] = ':ref' . $i;
                $bind['ref' . $i] = $ref;
            }
            $sql .= " AND lt.trans_reference NOT IN (" . implode(',', $ph) . ")
                      AND (lt.trans_callback IS NULL OR lt.trans_callback NOT IN (" . implode(',', $ph) . "))";
        }
        if (!empty($claimedTxIds)) {
            $ph = [];
            foreach ($claimedTxIds as $i => $txId) {
                $ph[] = ':tx' . $i;
                $bind['tx' . $i] = $txId;
            }
            $sql .= " AND lt.id NOT IN (" . implode(',', $ph) . ")";
        }

        $sql .= " ORDER BY diff ASC, lt.created_at DESC LIMIT 50";

        $rows = $conn->executeQuery($sql, $bind)->fetchAllAssociative();

        return $this->success([
            'item_id'        => $itemId,
            'bank_amount'    => $bankAmount,
            'bank_reference' => $item->getBankReference(),
            'candidates'     => array_map(
                fn(array $r) => [
                    'id'           => $r['id'],
                    'reference'    => $r['trans_reference'] ?? $r['trans_callback'],
                    'amount'       => $r['trans_amount'],
                    'narration'    => $r['trans_narration'],
                    'trans_date'   => $r['trans_date'],
                    'amount_diff'  => $r['diff'],
                ],
                $rows,
            ),
        ]);
    }
}
