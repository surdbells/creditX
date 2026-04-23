<?php
declare(strict_types=1);
namespace App\Action\MakerChecker;

use App\Domain\Repository\{MakerCheckerRepository, UserRepository};
use App\Infrastructure\Service\{ApiResponse, AuditService, MakerCheckerExecutionService};
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Batch maker-checker decide — approve or reject many pending
 * requests in one call.
 *
 * Contract:
 *   POST /api/maker-checker/batch-decide
 *   Body: { request_ids: string[], action: 'approve'|'reject',
 *           comment?: string }
 *
 * Response shape:
 *   { status, message, data: { success: [...], failed: [...], total } }
 *
 * Semantics:
 *   - Per-item try/catch. Each MC request gets its own transaction
 *     in DecideMcAction (status flip + executor wrapped together);
 *     we replicate that pattern here per-item.
 *   - Self-check guard enforced per-item (same 403 condition as
 *     the single-item action): the checker cannot be the maker.
 *     Caught as DomainException and reported in failed[].
 *   - On approve, the executor runs the underlying operation.
 *     If the operation fails (e.g. loan already disbursed via
 *     another path), the status flip for THAT item rolls back.
 *     Sibling items in the same batch are unaffected.
 *   - Rejections don't invoke the executor — just archive the
 *     status. Fast, safe to batch.
 *   - Max batch size: 50 requests. Approvals can post many GL
 *     entries per item; same rationale as batch disburse.
 */
final class BatchDecideMcAction
{
    use ApiResponse;

    public function __construct(
        private readonly MakerCheckerRepository $mcRepo,
        private readonly UserRepository $userRepo,
        private readonly AuditService $audit,
        private readonly MakerCheckerExecutionService $executor,
        private readonly EntityManagerInterface $em,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $userId = $request->getAttribute('user_id');
        $user = $this->userRepo->find($userId);
        if ($user === null) return $this->unauthorized('User not found');

        $data = (array) ($request->getParsedBody() ?? []);
        $ids = $data['request_ids'] ?? [];
        $action = $data['action'] ?? '';
        $comment = $data['comment'] ?? null;

        if (!is_array($ids) || count($ids) === 0) {
            return $this->validationError(['request_ids' => 'At least one request_id is required']);
        }
        if (count($ids) > 50) {
            return $this->validationError(['request_ids' => 'Maximum 50 requests per batch']);
        }
        if (!in_array($action, ['approve', 'reject'], true)) {
            return $this->validationError(['action' => 'Action must be "approve" or "reject"']);
        }

        $success = [];
        $failed = [];

        foreach ($ids as $id) {
            $mcId = (string) $id;
            $mc = $this->mcRepo->find($mcId);
            if ($mc === null) {
                $failed[] = ['request_id' => $mcId, 'error' => 'Request not found'];
                continue;
            }
            if (!$mc->isPending()) {
                $failed[] = ['request_id' => $mcId, 'error' => 'Request has already been decided'];
                continue;
            }
            if ($mc->getMaker()->getId() === $userId) {
                $failed[] = ['request_id' => $mcId, 'error' => 'Maker cannot be the checker for their own request'];
                continue;
            }

            if ($action === 'reject') {
                // No executor — just archive.
                try {
                    $mc->reject($user, $comment);
                    $this->mcRepo->flush();
                    $this->audit->logUpdate(
                        $userId, 'MakerCheckerRequest', $mc->getId(),
                        ['status' => 'pending'], ['status' => $mc->getStatus()->value],
                        $this->getClientIp($request), $this->getUserAgent($request),
                    );
                    $success[] = [
                        'request_id'     => $mcId,
                        'operation_type' => $mc->getOperationType(),
                        'result'         => ['status' => 'rejected'],
                    ];
                } catch (\Throwable $e) {
                    $failed[] = ['request_id' => $mcId, 'error' => $e->getMessage()];
                }
                continue;
            }

            // Approve path — per-item transaction wraps status flip +
            // executor call, identical to DecideMcAction. If execution
            // fails, rollback unwinds the status flip for this item.
            $this->em->beginTransaction();
            try {
                $mc->approve($user, $comment);
                $this->mcRepo->flush();

                $result = $this->executor->execute($mc, $user);

                $this->em->commit();

                $this->audit->logUpdate(
                    $userId, 'MakerCheckerRequest', $mc->getId(),
                    ['status' => 'pending'],
                    ['status' => 'approved', 'execution_result' => $result],
                    $this->getClientIp($request), $this->getUserAgent($request),
                );

                $success[] = [
                    'request_id'     => $mcId,
                    'operation_type' => $mc->getOperationType(),
                    'result'         => $result,
                ];
            } catch (\App\Domain\Exception\DomainException $e) {
                if ($this->em->getConnection()->isTransactionActive()) {
                    $this->em->rollback();
                }
                $failed[] = [
                    'request_id'     => $mcId,
                    'operation_type' => $mc->getOperationType(),
                    'error'          => 'Execution failed: ' . $e->getMessage(),
                ];
            } catch (\Throwable $e) {
                if ($this->em->getConnection()->isTransactionActive()) {
                    $this->em->rollback();
                }
                $failed[] = [
                    'request_id'     => $mcId,
                    'operation_type' => $mc->getOperationType(),
                    'error'          => 'Unexpected error: ' . $e->getMessage(),
                ];
            }
        }

        $succeeded = count($success);
        $fcount = count($failed);
        $verb = $action === 'approve' ? 'approved' : 'rejected';
        $msg = $fcount === 0
            ? sprintf('All %d requests %s successfully', $succeeded, $verb)
            : sprintf('%d %s, %d failed', $succeeded, $verb, $fcount);

        return $this->success([
            'success' => $success,
            'failed'  => $failed,
            'total'   => count($ids),
        ], $msg);
    }
}
