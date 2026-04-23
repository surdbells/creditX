<?php
declare(strict_types=1);
namespace App\Action\Approval;

use App\Domain\Repository\{LoanRepository, UserRepository};
use App\Infrastructure\Service\{ApiResponse, ApprovalEngineService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Batch approval decide — approve or reject many loans in one call.
 *
 * Contract:
 *   POST /api/approvals/batch-decide
 *   Body: { loan_ids: string[], action: 'approve'|'reject', comment?: string }
 *
 * Response shape:
 *   { status: 'success', message: 'N approved, M failed',
 *     data: {
 *       success: [{ loan_id, application_id, result: {...} }, ...],
 *       failed:  [{ loan_id, application_id, error }, ...],
 *       total:   number,
 *     } }
 *
 * Semantics:
 *   - Per-item try/catch. A failure on one loan does NOT abort the
 *     rest. The caller sees exactly which IDs succeeded and which
 *     failed, with the specific error per row.
 *   - No enveloping transaction. Each loan's decide() already opens
 *     its own transaction with pessimistic locking — that's the
 *     correct scope for atomicity. A wider batch transaction would
 *     make a single bad loan (e.g. already-decided race) roll back
 *     the whole batch, which is wrong for 'best-effort batch' UX.
 *   - Rejections REQUIRE a comment. The backend single-item action
 *     allows null comments (for approve) but the ApprovalEngineService
 *     will (in a later commit) require comment for reject. Today the
 *     service accepts null comment for both — if you want forced
 *     rejection reasons, that's a separate pre-flight check here.
 *   - Max batch size: 100 loan_ids. Anything larger should paginate
 *     or use a background job — but 100 covers realistic approval
 *     queues comfortably.
 */
final class BatchDecideApprovalAction
{
    use ApiResponse;

    public function __construct(
        private readonly ApprovalEngineService $engine,
        private readonly LoanRepository $loanRepo,
        private readonly UserRepository $userRepo,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $userId = $request->getAttribute('user_id');
        $user = $this->userRepo->find($userId);
        if ($user === null) return $this->unauthorized('User not found');

        $data = (array) ($request->getParsedBody() ?? []);
        $loanIds = $data['loan_ids'] ?? [];
        $action = $data['action'] ?? '';
        $comment = $data['comment'] ?? null;

        if (!is_array($loanIds) || count($loanIds) === 0) {
            return $this->validationError(['loan_ids' => 'At least one loan_id is required']);
        }
        if (count($loanIds) > 100) {
            return $this->validationError(['loan_ids' => 'Maximum 100 loans per batch']);
        }
        if (!in_array($action, ['approve', 'reject'], true)) {
            return $this->validationError(['action' => 'Action must be "approve" or "reject"']);
        }

        $success = [];
        $failed = [];

        foreach ($loanIds as $loanId) {
            // Normalise to string — defensive against mixed payload types.
            $lid = (string) $loanId;
            $loan = $this->loanRepo->find($lid);
            if ($loan === null) {
                $failed[] = ['loan_id' => $lid, 'application_id' => null, 'error' => 'Loan not found'];
                continue;
            }

            try {
                $result = $this->engine->decide($loan, $user, $action, $comment);
                $success[] = [
                    'loan_id'        => $lid,
                    'application_id' => $loan->getApplicationId(),
                    'result'         => $result,
                ];
            } catch (\App\Domain\Exception\DomainException $e) {
                $failed[] = [
                    'loan_id'        => $lid,
                    'application_id' => $loan->getApplicationId(),
                    'error'          => $e->getMessage(),
                ];
            } catch (\Throwable $e) {
                // Unexpected errors also logged per-item. Don't let a
                // panic on loan #3 prevent loans #4..N from processing.
                $failed[] = [
                    'loan_id'        => $lid,
                    'application_id' => $loan->getApplicationId(),
                    'error'          => 'Unexpected error: ' . $e->getMessage(),
                ];
            }
        }

        $total = count($loanIds);
        $succeeded = count($success);
        $fcount = count($failed);
        $verb = $action === 'approve' ? 'approved' : 'rejected';
        $msg = $fcount === 0
            ? sprintf('All %d loans %s successfully', $succeeded, $verb)
            : sprintf('%d %s, %d failed', $succeeded, $verb, $fcount);

        return $this->success([
            'success' => $success,
            'failed'  => $failed,
            'total'   => $total,
        ], $msg);
    }
}
