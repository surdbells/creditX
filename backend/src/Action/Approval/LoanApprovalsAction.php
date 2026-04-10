<?php
declare(strict_types=1);
namespace App\Action\Approval;

use App\Infrastructure\Service\{ApiResponse, ApprovalEngineService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class LoanApprovalsAction
{
    use ApiResponse;
    public function __construct(private readonly ApprovalEngineService $engine) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $approvals = $this->engine->getLoanApprovals($args['id'] ?? '');
        return $this->success($approvals);
    }
}
