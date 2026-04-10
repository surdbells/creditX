<?php
declare(strict_types=1);
namespace App\Action\ApprovalWorkflow;

use App\Domain\Repository\ApprovalWorkflowRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class GetWorkflowAction
{
    use ApiResponse;
    public function __construct(private readonly ApprovalWorkflowRepository $repo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $wf = $this->repo->find($args['id'] ?? '');
        if ($wf === null) return $this->notFound('Approval workflow not found');
        return $this->success($wf->toArray());
    }
}
