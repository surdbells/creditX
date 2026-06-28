<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Domain\Entity\FixedAsset;
use App\Infrastructure\Service\{ApiResponse, FixedAssetService};
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Fixed-asset register endpoints:
 *   GET  /api/accounting/fixed-assets
 *   POST /api/accounting/fixed-assets
 *   POST /api/accounting/fixed-assets/{id}/dispose   { disposal_date, proceeds }
 */
final class FixedAssetsAction
{
    use ApiResponse;

    public function __construct(
        private readonly FixedAssetService $service,
        private readonly EntityManagerInterface $em,
    ) {}

    public function list(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $p = $request->getQueryParams();
        $limit = max(1, min((int) ($p['limit'] ?? 100), 500));
        $qb = $this->em->createQueryBuilder()->select('a')->from(FixedAsset::class, 'a')
            ->orderBy('a.createdAt', 'DESC')->setMaxResults($limit);
        if (!empty($p['status'])) {
            $qb->where('a.status = :s')->setParameter('s', $p['status']);
        }
        $rows = $qb->getQuery()->getResult();
        return $this->success(['assets' => array_map(fn(FixedAsset $a) => $a->toArray(), $rows)]);
    }

    public function create(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $userId = $request->getAttribute('user_id');
        if ($userId === null) return $this->unauthorized();
        try {
            $asset = $this->service->register((array) ($request->getParsedBody() ?? []), $userId);
        } catch (\App\Domain\Exception\DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }
        return $this->created($asset->toArray(), 'Fixed asset registered');
    }

    public function dispose(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $userId = $request->getAttribute('user_id');
        if ($userId === null) return $this->unauthorized();
        $b = (array) ($request->getParsedBody() ?? []);
        try {
            $asset = $this->service->dispose(
                $args['id'] ?? '',
                (string) ($b['disposal_date'] ?? date('Y-m-d')),
                (string) ($b['proceeds'] ?? '0'),
                $userId,
            );
        } catch (\App\Domain\Exception\DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }
        return $this->success($asset->toArray(), 'Fixed asset disposed');
    }
}
