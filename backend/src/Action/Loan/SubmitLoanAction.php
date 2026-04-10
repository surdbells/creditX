<?php
declare(strict_types=1);
namespace App\Action\Loan;

use App\Domain\Entity\LoanTrail;
use App\Domain\Enum\LoanStatus;
use App\Domain\Repository\LoanRepository;
use App\Infrastructure\Service\{ApiResponse, ApprovalEngineService, AuditService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class SubmitLoanAction
{
    use ApiResponse;
    public function __construct(
        private readonly LoanRepository $repo,
        private readonly ApprovalEngineService $approvalEngine,
        private readonly AuditService $audit,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $loan = $this->repo->find($args['id'] ?? '');
        if ($loan === null) return $this->notFound('Loan not found');

        try {
            $loan->transitionTo(LoanStatus::SUBMITTED);
        } catch (\App\Domain\Exception\DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }

        $userId = $request->getAttribute('user_id');
        $trail = new LoanTrail();
        $trail->setUserId($userId);
        $trail->setAction('Loan submitted for approval');
        $trail->setIpAddress($this->getClientIp($request));
        $loan->addTrail($trail);

        $this->repo->flush();

        // Initiate approval workflow
        try {
            $this->approvalEngine->initiate($loan);
        } catch (\App\Domain\Exception\DomainException $e) {
            // If no workflow configured, loan stays in submitted state
            // and must be manually moved to approved
            $trail2 = new LoanTrail();
            $trail2->setUserId($userId);
            $trail2->setAction('No approval workflow configured — manual approval required');
            $trail2->setDetails(['reason' => $e->getMessage()]);
            $loan->addTrail($trail2);
            $this->repo->flush();
        }

        $this->audit->logUpdate($userId, 'Loan', $loan->getId(), ['status' => 'previous'], ['status' => $loan->getStatus()->value], $this->getClientIp($request), $this->getUserAgent($request));
        return $this->success($loan->toArray(true), 'Loan submitted for approval');
    }
}
