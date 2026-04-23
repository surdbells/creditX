<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Domain\Entity\CustomerLedger;
use App\Domain\Entity\LedgerTransaction;
use App\Infrastructure\Service\{ApiResponse, AuditService};
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * POST /api/accounting/transactions/{id}/reassign-ledger
 * Body: { customer_ledger_id: <uuid> }
 *
 * Move an orphan LedgerTransaction (customer_ledger_id IS NULL)
 * onto a specific CustomerLedger. Used by the GL Reconciliation
 * page's reassign workflow to clean up orphans left by legacy
 * posting bugs or manual journal entries.
 *
 * Constraints:
 *   - The target customer ledger must belong to the SAME GL as the
 *     transaction. Moving a posting to a ledger on a different GL
 *     would change the trial balance, which is not what 'reassign'
 *     means here — that's a reversal + re-post, different operation.
 *   - Only postings currently without a customer ledger can be
 *     reassigned. Re-homing an already-linked posting is explicitly
 *     NOT supported by this endpoint; operators who made a mistake
 *     there should reverse via the normal reversal flow.
 *
 * Audit trail: the old value (customer_ledger_id NULL) and new
 * value are logged via AuditService so the reassignment is
 * traceable.
 *
 * Gated by accounting.edit — same permission that gates reversals
 * and manual journal posting.
 */
final class ReassignOrphanPostingAction
{
    use ApiResponse;

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly AuditService $audit,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $txId = $args['id'] ?? '';
        $userId = $request->getAttribute('user_id');

        $tx = $this->em->find(LedgerTransaction::class, $txId);
        if ($tx === null) return $this->notFound('Transaction not found');

        if ($tx->getCustomerLedger() !== null) {
            return $this->error(
                'This posting is already linked to a customer ledger. ' .
                'Reassigning a linked posting is not supported — reverse ' .
                'the entry and re-post it instead.',
                400,
            );
        }

        $body = (array) ($request->getParsedBody() ?? []);
        $targetId = (string) ($body['customer_ledger_id'] ?? '');
        if ($targetId === '') {
            return $this->validationError(['customer_ledger_id' => 'Required']);
        }

        /** @var CustomerLedger|null $target */
        $target = $this->em->find(CustomerLedger::class, $targetId);
        if ($target === null) return $this->notFound('Customer ledger not found');

        // Same-GL constraint. A sub-ledger is a child of ONE parent
        // GL; moving a posting to a sub-ledger on a different GL
        // would silently shift the trial balance between accounts.
        if ($target->getGeneralLedger()->getId() !== $tx->getGeneralLedger()->getId()) {
            return $this->error(
                sprintf(
                    'Target ledger belongs to GL %s but the posting is on GL %s. ' .
                    'Pick a sub-ledger on the same GL, or reverse and re-post.',
                    $target->getGeneralLedger()->getAccountCode(),
                    $tx->getGeneralLedger()->getAccountCode(),
                ),
                400,
            );
        }

        $before = [
            'customer_ledger_id' => null,
            'trans_narration'    => $tx->getTransNarration(),
        ];

        $tx->setCustomerLedger($target);
        // Narration suffix makes the reassignment visible in the
        // transaction list without requiring operators to cross-
        // reference the audit log.
        $tx->setTransNarration(
            $tx->getTransNarration()
                . ' [reassigned ' . date('Y-m-d') . ' to ' . $target->getAccountNumber() . ']',
        );

        $this->em->flush();

        $this->audit->logUpdate(
            $userId, 'LedgerTransaction', $tx->getId(),
            $before,
            ['customer_ledger_id' => $target->getId(), 'trans_narration' => $tx->getTransNarration()],
            $this->getClientIp($request), $this->getUserAgent($request),
        );

        return $this->success([
            'id'                 => $tx->getId(),
            'customer_ledger_id' => $target->getId(),
            'customer_ledger_no' => $target->getAccountNumber(),
        ], 'Posting reassigned to ' . $target->getAccountNumber());
    }
}
