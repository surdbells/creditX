<?php
declare(strict_types=1);
namespace App\Action\Loan;

use App\Domain\Entity\LoanTrail;
use App\Domain\Enum\LoanStatus;
use App\Domain\Repository\LoanRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService, NotificationDispatchService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * POST /api/loans/{id}/cancel
 *
 * Cancels a loan (allowed from draft/captured/submitted/approved — including
 * after approval, before disbursement). A reason is REQUIRED and recorded on
 * the trail; the owning agent is notified (in-app + push + email).
 */
final class CancelLoanAction
{
    use ApiResponse;
    public function __construct(
        private readonly LoanRepository $repo,
        private readonly AuditService $audit,
        private readonly NotificationDispatchService $notifService,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $loan = $this->repo->find($args['id'] ?? '');
        if ($loan === null) return $this->notFound('Loan not found');

        $data = (array) ($request->getParsedBody() ?? []);
        $reason = trim((string) ($data['reason'] ?? ''));
        if ($reason === '') {
            return $this->validationError(['reason' => 'A cancellation reason is required.']);
        }

        try {
            $loan->transitionTo(LoanStatus::CANCELLED);
        } catch (\App\Domain\Exception\DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }

        $userId = $request->getAttribute('user_id');
        $trail = new LoanTrail();
        $trail->setUserId($userId);
        $trail->setAction('Loan cancelled');
        $trail->setDetails(['reason' => $reason]);
        $trail->setIpAddress($this->getClientIp($request));
        $loan->addTrail($trail);

        $this->repo->flush();

        // Notify the field agent that their loan was cancelled, with the reason.
        $this->notifService->notifyAgent(
            $loan->getAgent(),
            'Loan cancelled',
            "Loan {$loan->getApplicationId()} for {$loan->getCustomer()->getFullName()} has been cancelled — {$reason}",
            $loan->getCustomer()->getId(),
        );

        $this->audit->logUpdate($userId, 'Loan', $loan->getId(), ['status' => 'previous'], ['status' => LoanStatus::CANCELLED->value], $this->getClientIp($request), $this->getUserAgent($request));
        return $this->success($loan->toArray(), 'Loan cancelled');
    }
}
