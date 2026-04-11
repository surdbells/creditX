<?php
declare(strict_types=1);
namespace App\Action\Disbursement;

use App\Domain\Entity\MakerCheckerRequest;
use App\Domain\Repository\{LoanRepository, UserRepository};
use App\Infrastructure\Service\{ApiResponse, AuditService, DisbursementService, NotificationDispatchService, SettingsCacheService};
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class DisburseLoanAction
{
    use ApiResponse;
    public function __construct(
        private readonly LoanRepository $loanRepo,
        private readonly UserRepository $userRepo,
        private readonly DisbursementService $disbService,
        private readonly NotificationDispatchService $notifService,
        private readonly SettingsCacheService $settings,
        private readonly AuditService $audit,
        private readonly EntityManagerInterface $em,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $loan = $this->loanRepo->find($args['id'] ?? '');
        if ($loan === null) return $this->notFound('Loan not found');

        $data = (array) ($request->getParsedBody() ?? []);
        $settlementGlId = $data['settlement_gl_id'] ?? '';
        $effectiveDate = $data['effective_date'] ?? date('Y-m-d');

        if ($settlementGlId === '') return $this->validationError(['settlement_gl_id' => 'Settlement GL account is required']);

        $userId = $request->getAttribute('user_id');
        $user = $this->userRepo->find($userId);

        // Check maker-checker enforcement
        $makerCheckerEnabled = $this->settings->getBool('security.maker_checker_disbursement', false);
        if ($makerCheckerEnabled && $user !== null) {
            $mcRequest = new MakerCheckerRequest();
            $mcRequest->setOperationType('disbursement');
            $mcRequest->setEntityType('Loan');
            $mcRequest->setEntityId($loan->getId());
            $mcRequest->setPayload([
                'loan_id' => $loan->getId(),
                'settlement_gl_id' => $settlementGlId,
                'effective_date' => $effectiveDate,
            ]);
            $mcRequest->setMaker($user);
            $mcRequest->setMakerComment($data['comment'] ?? null);
            $this->em->persist($mcRequest);
            $this->em->flush();

            return $this->success([
                'maker_checker_id' => $mcRequest->getId(),
                'status' => 'pending_checker',
                'message' => 'Disbursement submitted for checker approval',
            ], 'Disbursement request submitted for approval');
        }

        try {
            $result = $this->disbService->disburse($loan, $settlementGlId, $effectiveDate, $userId);
        } catch (\App\Domain\Exception\DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }

        // Dispatch disbursement notification (Gap 4)
        try {
            $this->notifService->dispatchEvent('loan_disbursed', [
                'customer_name' => $loan->getCustomer()->getFullName(),
                'customer_email' => $loan->getCustomer()->getEmail(),
                'customer_phone' => $loan->getCustomer()->getPhone(),
                'loan_amount' => $result['net_disbursed'] ?? '',
                'application_id' => $loan->getApplicationId(),
                'user_id' => $userId,
            ], $userId, $loan->getCustomer()->getId());
        } catch (\Exception $e) { /* notification failure should not block disbursement */ }

        $this->audit->logCreate($userId, 'Disbursement', $loan->getId(), $result, $this->getClientIp($request), $this->getUserAgent($request));
        return $this->success($result, 'Loan disbursed successfully');
    }
}
