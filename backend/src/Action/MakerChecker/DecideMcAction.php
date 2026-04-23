<?php
declare(strict_types=1);
namespace App\Action\MakerChecker;

use App\Domain\Repository\{MakerCheckerRepository, UserRepository};
use App\Infrastructure\Service\{ApiResponse, AuditService, MakerCheckerExecutionService};
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class DecideMcAction
{
    use ApiResponse;
    public function __construct(
        private readonly MakerCheckerRepository $mcRepo,
        private readonly UserRepository $userRepo,
        private readonly AuditService $audit,
        private readonly MakerCheckerExecutionService $executor,
        private readonly EntityManagerInterface $em,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $mc = $this->mcRepo->find($args['id'] ?? '');
        if ($mc === null) return $this->notFound('Maker-checker request not found');
        if (!$mc->isPending()) return $this->error('Request has already been decided', 400);

        $userId = $request->getAttribute('user_id');
        if ($mc->getMaker()->getId() === $userId) {
            return $this->error('Maker cannot be the checker for the same request', 403);
        }

        $user = $this->userRepo->find($userId);
        if ($user === null) return $this->unauthorized('User not found');

        $data = (array) ($request->getParsedBody() ?? []);
        $action = $data['action'] ?? '';
        $comment = $data['comment'] ?? null;

        if (!in_array($action, ['approve', 'reject'], true)) {
            return $this->validationError(['action' => 'Must be "approve" or "reject"']);
        }

        // Reject path — no execution, just archive.
        if ($action === 'reject') {
            $mc->reject($user, $comment);
            $this->mcRepo->flush();
            $this->audit->logUpdate(
                $userId, 'MakerCheckerRequest', $mc->getId(),
                ['status' => 'pending'], ['status' => $mc->getStatus()->value],
                $this->getClientIp($request), $this->getUserAgent($request),
            );
            return $this->success($mc->toArray(), 'Request rejected successfully');
        }

        /*
         * Approve path — flip status + execute the underlying operation
         * in a single transaction. If execution fails, rollback unwinds
         * both the status flip and any partial writes, leaving the
         * request still pending so the checker can retry after fixing
         * the underlying issue.
         *
         * Prior to this service, MakerCheckerRequest::approve() just
         * set status=APPROVED without running the operation. Disbursements
         * submitted through maker-checker would sit in limbo forever.
         * This was the bug the user reported this session.
         */
        $this->em->beginTransaction();
        try {
            $mc->approve($user, $comment);
            $this->mcRepo->flush();

            $result = $this->executor->execute($mc, $user);

            $this->em->commit();
        } catch (\App\Domain\Exception\DomainException $e) {
            if ($this->em->getConnection()->isTransactionActive()) {
                $this->em->rollback();
            }
            return $this->error('Execution failed: ' . $e->getMessage(), 400);
        } catch (\Throwable $e) {
            if ($this->em->getConnection()->isTransactionActive()) {
                $this->em->rollback();
            }
            return $this->error('Unexpected error during execution: ' . $e->getMessage(), 500);
        }

        $this->audit->logUpdate(
            $userId, 'MakerCheckerRequest', $mc->getId(),
            ['status' => 'pending'],
            ['status' => 'approved', 'execution_result' => $result],
            $this->getClientIp($request), $this->getUserAgent($request),
        );

        return $this->success(
            array_merge($mc->toArray(), ['execution_result' => $result]),
            'Request approved and executed successfully'
        );
    }
}
