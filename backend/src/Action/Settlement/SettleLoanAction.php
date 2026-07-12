<?php
declare(strict_types=1);
namespace App\Action\Settlement;

use App\Domain\Exception\DomainException;
use App\Domain\Repository\{LoanRepository, UserRepository};
use App\Infrastructure\Service\{ApiResponse, AuditService, SettlementService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * POST /api/loans/{id}/settle
 *
 * Manually trigger (or retry) the outbound settlement transfer for a disbursed
 * loan. Honors the configured settlement mode: immediate mode sends now,
 * maker-checker mode queues a request for a second approver. Optional body:
 *   - provider: 'paystack' | 'flutterwave' (defaults to settlement.provider)
 */
final class SettleLoanAction
{
    use ApiResponse;

    public function __construct(
        private readonly LoanRepository $loanRepo,
        private readonly UserRepository $userRepo,
        private readonly SettlementService $settlementService,
        private readonly AuditService $audit,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $loan = $this->loanRepo->find($args['id'] ?? '');
        if ($loan === null) return $this->notFound('Loan not found');

        $data = (array) ($request->getParsedBody() ?? []);
        $provider = isset($data['provider']) && $data['provider'] !== '' ? (string) $data['provider'] : null;

        $userId = $request->getAttribute('user_id');
        $user = $this->userRepo->find($userId);
        if ($user === null) return $this->unauthorized('User not found');

        try {
            $result = $this->settlementService->requestManual($loan, $user, $provider);
        } catch (DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }

        $this->audit->logCreate($userId, 'Settlement', $loan->getId(), $result, $this->getClientIp($request), $this->getUserAgent($request));

        $message = ($result['mode'] ?? '') === 'maker_checker'
            ? 'Settlement submitted for checker approval'
            : 'Settlement initiated';
        return $this->success($result, $message);
    }
}
