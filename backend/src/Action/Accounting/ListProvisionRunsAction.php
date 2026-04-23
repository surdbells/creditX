<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Domain\Entity\ProvisionRun;
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GET /api/accounting/provisions/runs?limit=20
 *
 * History of provision runs, newest first. Summary view only —
 * doesn't include per-line breakdowns. Use GetProvisionRunAction
 * for drill-in.
 *
 * Gated by accounting.provision.
 */
final class ListProvisionRunsAction
{
    use ApiResponse;

    public function __construct(private readonly EntityManagerInterface $em) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $params = $request->getQueryParams();
        $limit = max(1, min((int) ($params['limit'] ?? 20), 100));

        $runs = $this->em->createQueryBuilder()
            ->select('r')
            ->from(ProvisionRun::class, 'r')
            ->orderBy('r.asOf', 'DESC')
            ->addOrderBy('r.createdAt', 'DESC')
            ->setMaxResults($limit)
            ->getQuery()
            ->getResult();

        return $this->success([
            'runs' => array_map(fn(ProvisionRun $r) => $r->toArray(false), $runs),
        ]);
    }
}
