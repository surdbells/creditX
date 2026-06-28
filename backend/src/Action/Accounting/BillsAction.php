<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Domain\Entity\Bill;
use App\Infrastructure\Service\{AccountsPayableService, ApiResponse};
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Bill (accounts-payable) endpoints:
 *   GET  /api/accounting/bills
 *   POST /api/accounting/bills
 *   POST /api/accounting/bills/{id}/approve
 *   POST /api/accounting/bills/{id}/pay       { amount, funding_gl_code?, payment_date? }
 *   GET  /api/reports/ap-aging?as_of=
 */
final class BillsAction
{
    use ApiResponse;

    public function __construct(
        private readonly AccountsPayableService $service,
        private readonly EntityManagerInterface $em,
    ) {}

    public function list(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $p = $request->getQueryParams();
        $limit = max(1, min((int) ($p['limit'] ?? 200), 500));
        $qb = $this->em->createQueryBuilder()->select('b')->from(Bill::class, 'b')
            ->orderBy('b.dueDate', 'DESC')->setMaxResults($limit);
        if (!empty($p['status'])) $qb->where('b.status = :s')->setParameter('s', $p['status']);
        $rows = $qb->getQuery()->getResult();
        return $this->success(['bills' => array_map(fn(Bill $b) => $b->toArray(), $rows)]);
    }

    public function create(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $userId = $request->getAttribute('user_id');
        if ($userId === null) return $this->unauthorized();
        try {
            $bill = $this->service->createBill((array) ($request->getParsedBody() ?? []), $userId);
        } catch (\App\Domain\Exception\DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }
        return $this->created($bill->toArray(), 'Bill captured');
    }

    public function approve(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $userId = $request->getAttribute('user_id');
        if ($userId === null) return $this->unauthorized();
        try {
            $bill = $this->service->approveBill($args['id'] ?? '', $userId);
        } catch (\App\Domain\Exception\DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }
        return $this->success($bill->toArray(), 'Bill approved');
    }

    public function pay(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $userId = $request->getAttribute('user_id');
        if ($userId === null) return $this->unauthorized();
        $b = (array) ($request->getParsedBody() ?? []);
        try {
            $bill = $this->service->payBill(
                $args['id'] ?? '',
                (string) ($b['amount'] ?? '0'),
                isset($b['funding_gl_code']) ? (string) $b['funding_gl_code'] : null,
                (string) ($b['payment_date'] ?? date('Y-m-d')),
                $userId,
                isset($b['wht_rate_code']) ? (string) $b['wht_rate_code'] : null,
            );
        } catch (\App\Domain\Exception\DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }
        return $this->success($bill->toArray(), 'Payment posted');
    }

    public function aging(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $asOf = (string) ($request->getQueryParams()['as_of'] ?? date('Y-m-d'));
        try {
            return $this->success($this->service->aging($asOf));
        } catch (\App\Domain\Exception\DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }
    }
}
