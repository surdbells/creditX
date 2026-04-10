<?php
declare(strict_types=1);
namespace App\Action\Loan;

use App\Domain\Repository\LoanRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService, LoanLifecycleService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class RestructureLoanAction
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
        $newTenure = (int) ($data['new_tenure'] ?? 0);
        if ($newTenure < 1) return $this->validationError(['new_tenure' => 'New tenure must be at least 1 month']);

        $userId = $request->getAttribute('user_id');

        try {
            $result = $this->lifecycleService->restructure($loan, $newTenure, $data['new_rate'] ?? null, $userId);
        } catch (\App\Domain\Exception\DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }

        $this->audit->logCreate($userId, 'Restructure', $loan->getId(), $result, $this->getClientIp($request), $this->getUserAgent($request));
        return $this->success($result, 'Loan restructured successfully');
    }
}
