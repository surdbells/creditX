<?php
declare(strict_types=1);
namespace App\Action\Approval;

use App\Domain\Repository\{LoanRepository, UserRepository};
use App\Infrastructure\Service\{ApiResponse, ApprovalEngineService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class DecideApprovalAction
{
    use ApiResponse;
    public function __construct(
        private readonly ApprovalEngineService $engine,
        private readonly LoanRepository $loanRepo,
        private readonly UserRepository $userRepo,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $loan = $this->loanRepo->find($args['id'] ?? '');
        if ($loan === null) return $this->notFound('Loan not found');

        $userId = $request->getAttribute('user_id');
        $user = $this->userRepo->find($userId);
        if ($user === null) return $this->unauthorized('User not found');

        $data = (array) ($request->getParsedBody() ?? []);
        $action = $data['action'] ?? '';
        $comment = $data['comment'] ?? null;

        if (!in_array($action, ['approve', 'reject'], true)) {
            return $this->validationError(['action' => 'Action must be "approve" or "reject"']);
        }

        try {
            $result = $this->engine->decide($loan, $user, $action, $comment);
        } catch (\App\Domain\Exception\DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }

        return $this->success($result, $result['message']);
    }
}
