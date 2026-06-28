<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Domain\Entity\BankReconciliation;
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GET /api/accounting/bank-reconciliations?limit=20
 *
 * Bank reconciliation sessions, newest statement date first.
 * Gated by reports.reconciliation.
 */
final class ListBankReconciliationsAction
{
    use ApiResponse;

    public function __construct(private readonly EntityManagerInterface $em) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $limit = max(1, min((int) ($request->getQueryParams()['limit'] ?? 20), 100));
        $rows = $this->em->createQueryBuilder()
            ->select('r')->from(BankReconciliation::class, 'r')
            ->orderBy('r.statementDate', 'DESC')
            ->addOrderBy('r.createdAt', 'DESC')
            ->setMaxResults($limit)
            ->getQuery()->getResult();

        return $this->success([
            'reconciliations' => array_map(fn(BankReconciliation $r) => $r->toArray(false), $rows),
        ]);
    }
}
