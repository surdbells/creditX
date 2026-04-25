<?php
declare(strict_types=1);
namespace App\Action\Loan;

use App\Domain\Entity\MakerCheckerRequest;
use App\Domain\Repository\{LoanRepository, UserRepository};
use App\Infrastructure\Service\{ApiResponse, AuditService, LoanLifecycleService, SettingsCacheService};
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * POST /api/loans/{id}/write-off
 *
 * When security.maker_checker_write_off is enabled, this action
 * doesn't apply the write-off directly — it captures a
 * MakerCheckerRequest of operation_type='write_off' that another
 * user (the checker) must approve via the maker-checker queue.
 * On approval, MakerCheckerExecutionService::executeWriteOff fires
 * the actual lifecycleService->writeOff() call.
 *
 * When the setting is off, the write-off applies immediately
 * (legacy behavior).
 */
final class WriteOffLoanAction
{
    use ApiResponse;
    public function __construct(
        private readonly LoanRepository $loanRepo,
        private readonly UserRepository $userRepo,
        private readonly LoanLifecycleService $lifecycleService,
        private readonly SettingsCacheService $settings,
        private readonly AuditService $audit,
        private readonly EntityManagerInterface $em,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $loan = $this->loanRepo->find($args['id'] ?? '');
        if ($loan === null) return $this->notFound('Loan not found');

        $data = (array) ($request->getParsedBody() ?? []);
        $userId = $request->getAttribute('user_id');
        $user = $this->userRepo->find($userId);

        // Maker-checker gate. Mirrors the disbursement / reversal pattern
        // exactly — when the setting is on, capture a pending request and
        // return early; the checker drives execution via the maker-checker
        // queue. When off, apply immediately.
        $makerCheckerEnabled = $this->settings->getBool('security.maker_checker_write_off', false);
        if ($makerCheckerEnabled && $user !== null) {
            $mc = new MakerCheckerRequest();
            $mc->setOperationType('write_off');
            $mc->setEntityType('Loan');
            $mc->setEntityId($loan->getId());
            $mc->setPayload([
                'loan_id' => $loan->getId(),
                'reason'  => $data['reason'] ?? null,
            ]);
            $mc->setMaker($user);
            $mc->setMakerComment($data['comment'] ?? null);
            $this->em->persist($mc);
            $this->em->flush();

            return $this->success([
                'maker_checker_id' => $mc->getId(),
                'status' => 'pending_checker',
                'message' => 'Write-off submitted for checker approval',
            ], 'Write-off request submitted for approval');
        }

        try {
            $result = $this->lifecycleService->writeOff($loan, $data['reason'] ?? null, $userId);
        } catch (\App\Domain\Exception\DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }

        $this->audit->logCreate($userId, 'WriteOff', $loan->getId(), $result, $this->getClientIp($request), $this->getUserAgent($request));
        return $this->success($result, 'Loan written off successfully');
    }
}
