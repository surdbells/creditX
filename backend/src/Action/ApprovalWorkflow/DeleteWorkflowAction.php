<?php
declare(strict_types=1);
namespace App\Action\ApprovalWorkflow;

use App\Domain\Repository\ApprovalWorkflowRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class DeleteWorkflowAction
{
    use ApiResponse;
    public function __construct(private readonly ApprovalWorkflowRepository $repo, private readonly AuditService $audit) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $wf = $this->repo->find($args['id'] ?? '');
        if ($wf === null) return $this->notFound('Approval workflow not found');

        $old = $wf->toArray();
        $this->repo->remove($wf);
        $this->repo->flush();

        $this->audit->logDelete($request->getAttribute('user_id'), 'ApprovalWorkflow', $args['id'], $old, $this->getClientIp($request), $this->getUserAgent($request));
        return $this->success(null, 'Approval workflow deleted successfully');
    }
}
