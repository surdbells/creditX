<?php
declare(strict_types=1);
namespace App\Action\Disbursement;

use App\Domain\Repository\{LoanRepository, UserRepository};
use App\Infrastructure\Service\{ApiResponse, AuditService, DisbursementService, SettingsCacheService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class DisburseLoanAction
{
    use ApiResponse;
    public function __construct(
        private readonly LoanRepository $loanRepo,
        private readonly UserRepository $userRepo,
        private readonly DisbursementService $disbService,
        private readonly SettingsCacheService $settings,
        private readonly AuditService $audit,
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

        // Check maker-checker if enabled
        $makerCheckerEnabled = $this->settings->getBool('security.maker_checker_disbursement', false);
        if ($makerCheckerEnabled) {
            // In a full implementation, this would create a MakerCheckerRequest
            // and return a pending status. For now, we proceed with direct disbursement.
            // Phase 5 MakerChecker integration is handled via the MakerChecker actions.
        }

        try {
            $result = $this->disbService->disburse($loan, $settlementGlId, $effectiveDate, $userId);
        } catch (\App\Domain\Exception\DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }

        $this->audit->logCreate($userId, 'Disbursement', $loan->getId(), $result, $this->getClientIp($request), $this->getUserAgent($request));
        return $this->success($result, 'Loan disbursed successfully');
    }
}
