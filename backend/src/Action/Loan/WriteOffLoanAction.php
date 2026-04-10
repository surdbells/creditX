<?php
declare(strict_types=1);
namespace App\Action\Loan;

use App\Domain\Repository\LoanRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService, LoanLifecycleService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class WriteOffLoanAction
{
    use ApiResponse;
    public function __construct(
        private readonly LoanRepository $loanRepo,
        private readonly LoanLifecycleService $lifecycleService,
        private readonly AuditService $audit,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $loan = $this->loanRepo->find($args['id'] ?? '');
        if ($loan === null) return $this->notFound('Loan not found');

        $data = (array) ($request->getParsedBody() ?? []);
        $userId = $request->getAttribute('user_id');

        try {
            $result = $this->lifecycleService->writeOff($loan, $data['reason'] ?? null, $userId);
        } catch (\App\Domain\Exception\DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }

        $this->audit->logCreate($userId, 'WriteOff', $loan->getId(), $result, $this->getClientIp($request), $this->getUserAgent($request));
        return $this->success($result, 'Loan written off successfully');
    }
}
