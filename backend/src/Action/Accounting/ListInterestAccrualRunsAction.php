<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Domain\Entity\InterestAccrualRun;
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GET /api/accounting/interest-accrual/runs?limit=20
 *
 * History of interest accrual runs, newest first (summary only).
 *
 * Gated by accounting.provision.
 */
final class ListInterestAccrualRunsAction
{
    use ApiResponse;

    public function __construct(private readonly EntityManagerInterface $em) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $params = $request->getQueryParams();
        $limit = max(1, min((int) ($params['limit'] ?? 20), 100));

        $runs = $this->em->createQueryBuilder()
            ->select('r')
            ->from(InterestAccrualRun::class, 'r')
            ->orderBy('r.periodYear', 'DESC')
            ->addOrderBy('r.periodMonth', 'DESC')
            ->addOrderBy('r.createdAt', 'DESC')
            ->setMaxResults($limit)
            ->getQuery()
            ->getResult();

        return $this->success([
            'runs' => array_map(fn(InterestAccrualRun $r) => $r->toArray(false), $runs),
        ]);
    }
}
