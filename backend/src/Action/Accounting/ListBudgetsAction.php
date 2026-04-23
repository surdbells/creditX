<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Domain\Entity\Budget;
use App\Domain\Entity\GeneralLedger;
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Budget list + search. Returns every budget row for a year
 * (optionally filtered by month). Used by both the budget admin
 * page and the budget-vs-actual report to know what was budgeted.
 *
 * Contract:
 *   GET /api/accounting/budgets?year=YYYY&month=MM
 *
 *   Required: year. Optional: month (if omitted, returns all
 *   months for the year).
 *
 * Gated by accounting.view (viewing budgets; editing uses
 * accounting.budget).
 */
final class ListBudgetsAction
{
    use ApiResponse;

    public function __construct(private readonly EntityManagerInterface $em) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $params = $request->getQueryParams();
        $year = (string) ($params['year'] ?? date('Y'));
        $month = $params['month'] ?? null;

        $qb = $this->em->createQueryBuilder()
            ->select('b', 'gl')
            ->from(Budget::class, 'b')
            ->innerJoin('b.generalLedger', 'gl')
            ->where('b.year = :year')
            ->setParameter('year', $year)
            ->orderBy('b.month', 'ASC')
            ->addOrderBy('gl.accountCode', 'ASC');

        if ($month !== null && $month !== '') {
            $qb->andWhere('b.month = :month')
               ->setParameter('month', str_pad((string) $month, 2, '0', STR_PAD_LEFT));
        }

        $budgets = array_map(
            fn(Budget $b) => $b->toArray(),
            $qb->getQuery()->getResult(),
        );

        return $this->success(['budgets' => $budgets]);
    }
}
