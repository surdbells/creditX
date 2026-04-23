<?php
declare(strict_types=1);
namespace App\Action\Disbursement;

use App\Domain\Entity\Loan;
use App\Domain\Enum\LoanStatus;
use App\Domain\Repository\LoanRepository;
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Disbursement queue endpoint.
 *
 * Returns all loans in APPROVED status — i.e. decision is final but
 * funds haven't moved yet. Users with loans.disburse act on this queue
 * to push approved loans to DISBURSED by pressing 'Confirm Disbursement'
 * on each row.
 *
 * Supports standard pagination + search (by application_id or customer
 * full name). Mirrors the response shape of the approval queue so the
 * admin DataTable can render it with the same component.
 */
final class DisbursementQueueAction
{
    use ApiResponse;

    public function __construct(
        private readonly EntityManagerInterface $em,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $params = $request->getQueryParams();
        $p = $this->getPaginationParams($params);
        $offset = $p['offset'];
        $limit = $p['per_page'];
        $search = $p['search'];

        /*
         * Base filter: loans that are APPROVED but not yet disbursed.
         *
         * Second filter: EXCLUDE loans that already have a pending
         * maker-checker disbursement request. Without this, a maker
         * who submits through the two-eyes flow would see the same
         * loan still sitting in their disbursement queue and could
         * submit again, producing duplicate MC requests. The UI
         * response to that race looks like success on each submit,
         * even though only one will ever actually fire — and the
         * checker would see a queue of duplicates to sift through.
         *
         * We use a NOT EXISTS subquery rather than a LEFT JOIN so
         * the count query stays on a single table and the execution
         * plan remains index-friendly (idx_mc_status + idx_mc_operation
         * already exist on maker_checker_requests).
         *
         * The subquery filters on:
         *   - operation_type = 'disbursement' (not reversals etc)
         *   - entity_id = loan id (the loan itself, not loan_id
         *     because MC stores entity_id generically)
         *   - status = 'pending' (approved/rejected MCs are OK —
         *     approved ones already completed the disbursement,
         *     rejected ones can be resubmitted by the maker)
         */
        $qb = $this->em->createQueryBuilder()
            ->select('l')
            ->from(Loan::class, 'l')
            ->innerJoin('l.customer', 'c')
            ->innerJoin('l.product', 'p')
            ->where('l.status = :status')
            ->andWhere(
                'NOT EXISTS ('
                . 'SELECT 1 FROM App\\Domain\\Entity\\MakerCheckerRequest mc '
                . 'WHERE mc.entityId = l.id '
                . "AND mc.operationType = 'disbursement' "
                . "AND mc.status = 'pending'"
                . ')'
            )
            ->setParameter('status', LoanStatus::APPROVED->value);

        if ($search !== null && $search !== '') {
            $qb->andWhere($qb->expr()->orX(
                $qb->expr()->like('LOWER(l.applicationId)', ':search'),
                $qb->expr()->like('LOWER(c.fullName)', ':search'),
            ))->setParameter('search', '%' . strtolower($search) . '%');
        }

        // Total count for pagination
        $countQb = clone $qb;
        $total = (int) $countQb->select('COUNT(l.id)')->getQuery()->getSingleScalarResult();

        $qb->orderBy('l.updatedAt', 'ASC')  // oldest-first: act on stale loans first
            ->setFirstResult($offset)
            ->setMaxResults($limit);

        /** @var Loan[] $loans */
        $loans = $qb->getQuery()->getResult();

        // Response shape: flatten fields that the admin DataTable
        // columns reference directly, while keeping the full loan
        // object available for consumers that need everything.
        $items = array_map(function (Loan $loan) {
            $loanArr = $loan->toArray();
            return array_merge($loanArr, [
                'loan'                => $loanArr,
                'application_id'      => $loanArr['application_id'] ?? null,
                'customer_name'       => $loanArr['customer_name'] ?? null,
                'product_name'        => $loanArr['product_name'] ?? null,
                'amount_requested'    => $loanArr['amount_requested'] ?? null,
                'net_disbursed'       => $loanArr['net_disbursed'] ?? null,
                'agent_name'          => $loanArr['agent_name'] ?? null,
                'branch_name'         => $loanArr['branch_name'] ?? null,
                'approved_at'         => $loanArr['updated_at'] ?? null,
            ]);
        }, $loans);

        return $this->paginated($items, $total, $p['page'], $limit);
    }
}
