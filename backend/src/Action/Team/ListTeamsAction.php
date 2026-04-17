<?php
declare(strict_types=1);
namespace App\Action\Team;
use App\Domain\Entity\Team;
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class ListTeamsAction {
    use ApiResponse;
    public function __construct(private readonly EntityManagerInterface $em) {}
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface {
        $params = $this->getPaginationParams($request->getQueryParams());
        $qp = $request->getQueryParams();
        $qb = $this->em->createQueryBuilder()->select('t')->from(Team::class, 't');
        if ($params['search']) {
            $qb->andWhere('LOWER(t.name) LIKE :s OR LOWER(t.code) LIKE :s')->setParameter('s', '%' . strtolower($params['search']) . '%');
        }
        if (!empty($qp['department_id'])) { $qb->andWhere('t.department = :did')->setParameter('did', $qp['department_id']); }
        $countQb = clone $qb;
        $total = (int) $countQb->select('COUNT(t.id)')->getQuery()->getSingleScalarResult();
        $items = $qb->orderBy("t.{$params['sort_by']}", $params['sort_dir'])->setFirstResult($params['offset'])->setMaxResults($params['per_page'])->getQuery()->getResult();
        return $this->paginated(array_map(fn($t) => $t->toArray(), $items), $total, $params['page'], $params['per_page']);
    }
}
