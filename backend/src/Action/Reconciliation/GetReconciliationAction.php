<?php
declare(strict_types=1);
namespace App\Action\Reconciliation;
use App\Domain\Repository\ReconciliationRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class GetReconciliationAction
{
    use ApiResponse;
    public function __construct(private readonly ReconciliationRepository $repo) {}
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $recon = $this->repo->find($args['id'] ?? '');
        if ($recon === null) return $this->notFound('Reconciliation not found');
        return $this->success($recon->toArray(true));
    }
}
