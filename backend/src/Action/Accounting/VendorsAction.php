<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Domain\Entity\Vendor;
use App\Infrastructure\Service\{AccountsPayableService, ApiResponse};
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Vendor endpoints:
 *   GET  /api/accounting/vendors
 *   POST /api/accounting/vendors
 */
final class VendorsAction
{
    use ApiResponse;

    public function __construct(
        private readonly AccountsPayableService $service,
        private readonly EntityManagerInterface $em,
    ) {}

    public function list(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $limit = max(1, min((int) ($request->getQueryParams()['limit'] ?? 200), 500));
        $rows = $this->em->createQueryBuilder()->select('v')->from(Vendor::class, 'v')
            ->orderBy('v.name', 'ASC')->setMaxResults($limit)->getQuery()->getResult();
        return $this->success(['vendors' => array_map(fn(Vendor $v) => $v->toArray(), $rows)]);
    }

    public function create(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        if ($request->getAttribute('user_id') === null) return $this->unauthorized();
        try {
            $vendor = $this->service->createVendor((array) ($request->getParsedBody() ?? []));
        } catch (\App\Domain\Exception\DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }
        return $this->created($vendor->toArray(), 'Vendor created');
    }
}
