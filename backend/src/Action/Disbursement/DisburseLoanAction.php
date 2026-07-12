<?php
declare(strict_types=1);
namespace App\Action\Disbursement;

use App\Domain\Entity\MakerCheckerRequest;
use App\Domain\Repository\{LoanRepository, UserRepository};
use App\Infrastructure\Service\{ApiResponse, AuditService, DisbursementService, NotificationDispatchService, SettingsCacheService, SettlementService};
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
        private readonly SettlementService $settlementService,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $loan = $this->loanRepo->find($args['id'] ?? '');
        if ($loan === null) return $this->notFound('Loan not found');

        $data = (array) ($request->getParsedBody() ?? []);
        $settlementGlId = $data['settlement_gl_id'] ?? '';
        $effectiveDate = $data['effective_date'] ?? date('Y-m-d');
        // Optional top-up override from the disbursement dialog. Null
        // means 'use the capture-time value'. Empty-string is treated
        // as null too — the UI sends '' when the admin leaves the
        // field untouched. Numeric zero is a meaningful value (means
        // 'no top-up applies') and is preserved.
        $topUpOverrideRaw = $data['top_up_balance'] ?? null;
        $topUpOverride = ($topUpOverrideRaw === null || $topUpOverrideRaw === '')
            ? null
            : (string) $topUpOverrideRaw;

        if ($settlementGlId === '') return $this->validationError(['settlement_gl_id' => 'Settlement GL account is required']);

        // Optional settlement provider override ('paystack' | 'flutterwave').
        // Null falls back to the settlement.provider setting.
        $settlementProvider = isset($data['settlement_provider']) && $data['settlement_provider'] !== ''
            ? (string) $data['settlement_provider']
            : null;

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
                'settlement_provider' => $settlementProvider,
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
            $result = $this->disbService->disburse($loan, $settlementGlId, $effectiveDate, $userId, $topUpOverride);
        } catch (\App\Domain\Exception\DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }

        // Notify the field agent that the loan was disbursed (in-app + push +
        // email). Previously this routed to the operator ($userId) rather than
        // the loan's agent — corrected to notify the owning agent.
        $this->notifService->notifyAgent(
            $loan->getAgent(),
            'Loan disbursed',
            "Loan {$loan->getApplicationId()} for {$loan->getCustomer()->getFullName()} has been disbursed (net " . ($result['net_disbursed'] ?? '') . ").",
            $loan->getCustomer()->getId(),
        );

        $this->audit->logCreate($userId, 'Disbursement', $loan->getId(), $result, $this->getClientIp($request), $this->getUserAgent($request));

        // Hand off to settlement (outbound bank transfer) per configured mode.
        // Returns null when settlement is disabled; never throws — a
        // settlement problem must not fail the completed disbursement.
        $settlement = $this->settlementService->handlePostDisbursement($loan, $user, $settlementProvider);
        if ($settlement !== null) {
            $result['settlement'] = $settlement;
        }

        return $this->success($result, 'Loan disbursed successfully');
    }
}
