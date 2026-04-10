<?php
declare(strict_types=1);
namespace App\Action\Reconciliation;
use App\Domain\Repository\ReconciliationRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class ResolveReconciliationAction
{
    use ApiResponse;
    public function __construct(private readonly ReconciliationRepository $repo, private readonly AuditService $audit) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $recon = $this->repo->find($args['id'] ?? '');
        if ($recon === null) return $this->notFound('Reconciliation not found');

        $data = (array) ($request->getParsedBody() ?? []);
        $userId = $request->getAttribute('user_id');
        $recon->resolve($userId, $data['notes'] ?? null);
        $this->repo->flush();

        $this->audit->logUpdate($userId, 'Reconciliation', $recon->getId(), ['status' => 'exception'], ['status' => 'resolved'], $this->getClientIp($request), $this->getUserAgent($request));
        return $this->success($recon->toArray(), 'Reconciliation resolved');
    }
}
