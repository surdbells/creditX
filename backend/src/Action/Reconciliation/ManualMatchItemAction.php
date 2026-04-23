<?php
declare(strict_types=1);
namespace App\Action\Reconciliation;

use App\Domain\Entity\LedgerTransaction;
use App\Domain\Entity\ReconciliationItem;
use App\Domain\Enum\ReconciliationMatchType;
use App\Domain\Enum\ReconciliationStatus;
use App\Domain\Repository\ReconciliationRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService};
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * POST /api/reconciliations/{id}/items/{itemId}/manual-match
 * Body: { system_tx_id: "<ledger-transaction-uuid>" }
 *
 * Pair a bank-only reconciliation item with a system ledger
 * transaction manually — used when the auto-matcher missed a pairing
 * (typo in reference, bank truncated the ref, customer's name in the
 * narration only, etc).
 *
 * ## Behaviour
 *
 * - Only unmatched BANK items can be manually matched. Bank items
 *   that are already matched have no capacity for a second pairing;
 *   system-only items are the inverse problem and resolve differently
 *   (tx was recorded internally but never left the building — usually
 *   a 'resolve as other' with a note, not a match).
 * - The chosen system_tx must not already be matched against another
 *   reconciliation item in the same reconciliation — enforced via a
 *   DB check before commit. Prevents double-counting.
 * - Populates the item's system_reference + system_amount from the
 *   ledger transaction, flips match_type to MANUAL, status to
 *   MATCHED. Resolved_at/by stay null because 'matched' is a
 *   stronger statement than 'resolved' — the reconciliation as a
 *   whole still needs the user to hit Resolve once every item is
 *   either matched or explicitly resolved.
 *
 * ## Why we don't re-classify the bank amount vs system amount
 *
 * If the amounts differ, we leave both on the item. The user is
 * asserting 'these are the same transaction' — a difference
 * usually means a bank fee was deducted or an FX spread applied.
 * The reconciliation summary math (bank_total − system_total)
 * surfaces the gap.
 *
 * Gated by reports.reconciliation.
 */
final class ManualMatchItemAction
{
    use ApiResponse;

    public function __construct(
        private readonly ReconciliationRepository $reconRepo,
        private readonly EntityManagerInterface $em,
        private readonly AuditService $audit,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $reconId = $args['id'] ?? '';
        $itemId = $args['itemId'] ?? '';
        $userId = $request->getAttribute('user_id');

        $recon = $this->reconRepo->find($reconId);
        if ($recon === null) return $this->notFound('Reconciliation not found');

        /** @var ReconciliationItem|null $item */
        $item = $this->em->find(ReconciliationItem::class, $itemId);
        if ($item === null || $item->getReconciliation()->getId() !== $recon->getId()) {
            return $this->notFound('Item not found in this reconciliation');
        }

        if ($item->getMatchType() !== ReconciliationMatchType::UNMATCHED_BANK) {
            return $this->error(
                'Only unmatched bank items can be manually matched. ' .
                'Use Resolve to disposition other exceptions.',
                400,
            );
        }

        $body = (array) ($request->getParsedBody() ?? []);
        $txId = (string) ($body['system_tx_id'] ?? '');
        if ($txId === '') {
            return $this->validationError(['system_tx_id' => 'Required']);
        }

        /** @var LedgerTransaction|null $tx */
        $tx = $this->em->find(LedgerTransaction::class, $txId);
        if ($tx === null) {
            return $this->notFound('System transaction not found');
        }

        // Prevent the same tx being claimed twice in one reconciliation.
        // A single system transaction maps to at most one bank row.
        $already = $this->em->createQueryBuilder()
            ->select('COUNT(i.id)')
            ->from(ReconciliationItem::class, 'i')
            ->where('i.reconciliation = :r')
            ->andWhere('i.manualMatchTxId = :t')
            ->andWhere('i.id != :self')
            ->setParameter('r', $recon)
            ->setParameter('t', $txId)
            ->setParameter('self', $item->getId())
            ->getQuery()
            ->getSingleScalarResult();
        if ((int) $already > 0) {
            return $this->error(
                'That system transaction is already manually matched to another bank row.',
                409,
            );
        }

        $before = $item->toArray();

        $item->setSystemReference($tx->getTransReference() ?? $tx->getTransCallback());
        $item->setSystemAmount($tx->getTransAmount());
        $item->setMatchType(ReconciliationMatchType::MANUAL);
        $item->setStatus(ReconciliationStatus::MATCHED);
        $item->setManualMatchTxId($txId);

        $this->em->flush();

        $this->audit->logUpdate(
            $userId, 'ReconciliationItem', $item->getId(),
            $before, $item->toArray(),
            $this->getClientIp($request), $this->getUserAgent($request),
        );

        return $this->success($item->toArray(), 'Manually matched');
    }
}
