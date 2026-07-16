<?php
declare(strict_types=1);
namespace App\Action\Loan;

use App\Domain\Entity\LoanTrail;
use App\Domain\Enum\LoanStatus;
use App\Domain\Repository\{DocumentRepository, DocumentTypeConfigRepository, LoanRepository};
use App\Infrastructure\Service\{ApiResponse, ApprovalEngineService, AuditService, NotificationDispatchService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class SubmitLoanAction
{
    use ApiResponse;

    public function __construct(
        private readonly LoanRepository $repo,
        private readonly ApprovalEngineService $approvalEngine,
        private readonly AuditService $audit,
        private readonly NotificationDispatchService $notifService,
        private readonly DocumentRepository $documentRepo,
        private readonly \Doctrine\ORM\EntityManagerInterface $em,
        private readonly DocumentTypeConfigRepository $docTypeRepo,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $loan = $this->repo->find($args['id'] ?? '');
        if ($loan === null) return $this->notFound('Loan not found');

        // Field agents may only submit their own jobs (back-office staff aren't
        // scoped, even if they carry the is_agent flag).
        $callerId = $request->getAttribute('user_id');
        $caller = $callerId ? $this->em->find(\App\Domain\Entity\User::class, $callerId) : null;
        if ($caller instanceof \App\Domain\Entity\User && $caller->isLoanScopedToSelf()
            && $loan->getAgent()?->getId() !== $callerId) {
            return $this->notFound('Loan not found');
        }

        // Enforce required documents at submit-for-approval (they can be
        // skipped during capture, but not at this gate). Which documents are
        // mandatory is configured per document type (document_types.is_required)
        // and applies globally — no hardcoded list, so operations can change
        // what blocks submission without a deploy.
        $present = array_map(
            fn($d) => $d->getType(),
            $this->documentRepo->findByLoan($loan->getId()),
        );
        $missing = [];
        foreach ($this->docTypeRepo->findRequiredActive() as $required) {
            if (!in_array($required->getCode(), $present, true)) {
                $missing[] = $required->getLabel();
            }
        }
        if (!empty($missing)) {
            return $this->error(
                'Cannot submit for approval — these required documents are missing: '
                . implode(', ', $missing) . '. Please upload them first.',
                422,
            );
        }

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

        // Notify the field agent (in-app + push + email).
        $customer = $loan->getCustomer();
        $this->notifService->notifyAgent(
            $loan->getAgent(),
            'Loan submitted for approval',
            "Loan {$loan->getApplicationId()} for {$customer->getFullName()} has been submitted for approval.",
            $customer->getId(),
        );

        $this->audit->logUpdate($userId, 'Loan', $loan->getId(), ['status' => 'previous'], ['status' => $loan->getStatus()->value], $this->getClientIp($request), $this->getUserAgent($request));
        return $this->success($loan->toArray(true), 'Loan submitted for approval');
    }
}
