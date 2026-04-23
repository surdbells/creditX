<?php
declare(strict_types=1);
namespace App\Action\Reconciliation;

use App\Domain\Entity\ReconciliationItem;
use App\Domain\Enum\ReconciliationStatus;
use App\Domain\Repository\ReconciliationRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService};
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * POST /api/reconciliations/{id}/items/{itemId}/resolve
 * Body: { category: 'bank_fee' | 'timing' | 'other', note?: string }
 *
 * Mark an individual exception as resolved WITHOUT pairing it with a
 * system transaction. Used for:
 *   - bank_fee: a debit on the bank side that has no system
 *     counterpart because we never booked it (bank charged us
 *     directly, not via a loan transaction)
 *   - timing:   the entry is in transit — bank shows it this month,
 *     system will book it next month (or vice-versa)
 *   - other:    catch-all for one-off discrepancies; the required
 *     note captures what happened
 *
 * Distinguishing these categories matters for month-end reporting —
 * bank_fee entries typically become GL bank-charge postings, timing
 * differences reverse out next period, 'other' needs investigation.
 *
 * ## Why not just whole-reconciliation resolve
 *
 * The existing ResolveReconciliationAction marks the whole statement
 * 'resolved' in one shot with a single notes field. That's too
 * coarse — a January statement with 50 matched rows and 3 exceptions
 * needs per-line explanations of the 3 exceptions for the audit
 * trail, not a single lumped note.
 *
 * Gated by reports.reconciliation.
 */
final class ResolveItemAction
{
    use ApiResponse;

    private const ALLOWED_CATEGORIES = ['bank_fee', 'timing', 'other'];

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

        if ($item->getStatus() === ReconciliationStatus::MATCHED) {
            return $this->error(
                'This item is already matched — resolving only applies to exceptions.',
                400,
            );
        }

        $body = (array) ($request->getParsedBody() ?? []);
        $category = (string) ($body['category'] ?? '');
        $note = $body['note'] ?? null;

        $errors = [];
        if (!in_array($category, self::ALLOWED_CATEGORIES, true)) {
            $errors['category'] = "Must be one of: " . implode(', ', self::ALLOWED_CATEGORIES);
        }
        // 'other' category must come with a note — it's the catch-all
        // and losing the reason makes the audit trail useless.
        if ($category === 'other' && (!is_string($note) || trim($note) === '')) {
            $errors['note'] = "Required when category is 'other'";
        }
        if ($errors) return $this->validationError($errors);

        $before = $item->toArray();

        $item->setResolutionCategory($category);
        $item->setResolutionNote(is_string($note) ? trim($note) : null);
        $item->setResolvedAt(new \DateTimeImmutable(
            'now', new \DateTimeZone($_ENV['APP_TIMEZONE'] ?? 'Africa/Lagos'),
        ));
        $item->setResolvedBy($userId);
        $item->setStatus(ReconciliationStatus::RESOLVED);

        $this->em->flush();

        $this->audit->logUpdate(
            $userId, 'ReconciliationItem', $item->getId(),
            $before, $item->toArray(),
            $this->getClientIp($request), $this->getUserAgent($request),
        );

        return $this->success($item->toArray(), 'Item resolved');
    }
}
