<?php
declare(strict_types=1);
namespace App\Action\Loan;

use App\Domain\Enum\LoanStatus;
use App\Domain\Repository\LoanRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class UpdateLoanAction
{
    use ApiResponse;
    public function __construct(private readonly LoanRepository $repo, private readonly AuditService $audit) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $loan = $this->repo->find($args['id'] ?? '');
        if ($loan === null) return $this->notFound('Loan not found');

        // Only allow updates in draft/captured status
        if (!in_array($loan->getStatus(), [LoanStatus::DRAFT, LoanStatus::CAPTURED], true)) {
            return $this->error('Loan can only be edited in Draft or Captured status', 400);
        }

        $old = $loan->toArray();
        $data = (array) ($request->getParsedBody() ?? []);

        if (isset($data['amount'])) $loan->setAmountRequested($data['amount']);
        if (isset($data['tenure'])) $loan->setTenure((int) $data['tenure']);
        if (isset($data['bank_statement_mode'])) $loan->setBankStatementMode($data['bank_statement_mode']);

        $this->repo->flush();
        $this->audit->logUpdate($request->getAttribute('user_id'), 'Loan', $loan->getId(), $old, $loan->toArray(), $this->getClientIp($request), $this->getUserAgent($request));
        return $this->success($loan->toArray(true), 'Loan updated successfully');
    }
}
