<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Domain\Entity\ProvisionRun;
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GET /api/accounting/provisions/runs/{id}
 *
 * Full run detail including every per-loan line with snapshots.
 *
 * Gated by accounting.provision.
 */
final class GetProvisionRunAction
{
    use ApiResponse;

    public function __construct(private readonly EntityManagerInterface $em) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $run = $this->em->find(ProvisionRun::class, $args['id'] ?? '');
        if ($run === null) return $this->notFound('Provision run not found');

        return $this->success($run->toArray(true));
    }
}
