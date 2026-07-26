<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Domain\Entity\BackdateApproval;
use App\Domain\Repository\BackdateApprovalRepository;
use App\Infrastructure\Service\{AccountingDateService, ApiResponse, AuditService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Backdated-posting approvals (§10). One action, four routes, because they
 * share the same repository and audit shape:
 *
 *   GET  /accounting/backdate-approvals            list (filter by status)
 *   POST /accounting/backdate-approvals            request approval for a date
 *   POST /accounting/backdate-approvals/{id}/approve
 *   POST /accounting/backdate-approvals/{id}/reject
 *
 * Requesting needs accounting.backdate (you may only ask for what you could
 * otherwise do); deciding needs accounting.reopen_period, which is already the
 * "senior accounting" permission and avoids inventing a sixth.
 */
final class BackdateApprovalAction
{
    use ApiResponse;

    public const MODE_LIST    = 'list';
    public const MODE_REQUEST = 'request';
    public const MODE_APPROVE = 'approve';
    public const MODE_REJECT  = 'reject';

    /** How long an approval stays usable once granted. */
    private const VALID_HOURS = 24;

    public function __construct(
        private readonly BackdateApprovalRepository $repo,
        private readonly AccountingDateService $dates,
        private readonly AuditService $audit,
        private readonly string $mode = self::MODE_LIST,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args = []): ResponseInterface
    {
        return match ($this->mode) {
            self::MODE_REQUEST => $this->request($request),
            self::MODE_APPROVE => $this->decide($request, $args, true),
            self::MODE_REJECT  => $this->decide($request, $args, false),
            default            => $this->list($request),
        };
    }

    private function list(ServerRequestInterface $request): ResponseInterface
    {
        $q = $request->getQueryParams();
        $p = $this->getPaginationParams($q);
        $result = $this->repo->findPaginated($p['offset'], $p['per_page'], [
            'status'       => $q['status'] ?? null,
            'requested_by' => $q['requested_by'] ?? null,
        ]);
        return $this->paginated(
            array_map(fn($a) => $a->toArray(), $result['items']),
            $result['total'], $p['page'], $p['per_page'],
        );
    }

    private function request(ServerRequestInterface $request): ResponseInterface
    {
        $data = (array) ($request->getParsedBody() ?? []);
        $date = trim((string) ($data['business_date'] ?? ''));
        $reason = trim((string) ($data['reason'] ?? ''));

        $errors = [];
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) $errors['business_date'] = 'Expected YYYY-MM-DD.';
        if ($reason === '') $errors['reason'] = 'Tell the approver what you need to post and why.';
        if ($errors) return $this->validationError($errors);

        if ($date >= $this->dates->currentAccountingDate()) {
            return $this->error('That date is not backdated — no approval is needed.', 400);
        }

        $userId = (string) $request->getAttribute('user_id');
        if ($this->repo->findPending($userId, $date) !== null) {
            return $this->error('You already have a pending request for that date.', 409);
        }

        $a = new BackdateApproval();
        $a->setRequestedBy($userId);
        $a->setBusinessDate(new \DateTimeImmutable($date));
        $a->setReason($reason);
        $a->setContext(isset($data['context']) && $data['context'] !== '' ? (string) $data['context'] : null);
        $a->setCreatedBy($userId);
        $this->repo->save($a);

        $this->audit->logCreate($userId, 'BackdateApproval', $a->getId(), $a->toArray(),
            $this->getClientIp($request), $this->getUserAgent($request));

        return $this->created($a->toArray(), 'Approval requested.');
    }

    private function decide(ServerRequestInterface $request, array $args, bool $approve): ResponseInterface
    {
        $a = $this->repo->find($args['id'] ?? '');
        if ($a === null) return $this->notFound('Approval request not found');
        if ($a->getStatus() !== BackdateApproval::STATUS_PENDING) {
            return $this->error("This request is already {$a->getStatus()}.", 409);
        }

        $userId = (string) $request->getAttribute('user_id');
        // Self-approval would defeat the control entirely.
        if ($a->getRequestedBy() === $userId) {
            return $this->error('You cannot approve your own backdating request.', 403);
        }

        $data = (array) ($request->getParsedBody() ?? []);
        $note = isset($data['note']) ? trim((string) $data['note']) : null;
        $before = $a->toArray();

        if ($approve) {
            $a->approve($userId, $note, (new \DateTimeImmutable())->modify('+' . self::VALID_HOURS . ' hours'));
        } else {
            if ($note === null || $note === '') {
                return $this->validationError(['note' => 'A note is required when rejecting.']);
            }
            $a->reject($userId, $note);
        }
        $this->repo->flush();

        $this->audit->logUpdate($userId, 'BackdateApproval', $a->getId(), $before, $a->toArray(),
            $this->getClientIp($request), $this->getUserAgent($request));

        return $this->success($a->toArray(), $approve
            ? sprintf('Approved. Valid for %d hours, single use.', self::VALID_HOURS)
            : 'Request rejected.');
    }
}
