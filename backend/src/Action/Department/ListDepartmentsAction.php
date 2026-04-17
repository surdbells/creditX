<?php
declare(strict_types=1);
namespace App\Action\Department;
use App\Domain\Entity\Department;
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class ListDepartmentsAction {
    use ApiResponse;
    public function __construct(private readonly EntityManagerInterface $em) {}
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface {
        $params = $this->getPaginationParams($request->getQueryParams());
        $qb = $this->em->createQueryBuilder()->select('d')->from(Department::class, 'd');
        if ($params['search']) {
            $qb->andWhere('LOWER(d.name) LIKE :s OR LOWER(d.code) LIKE :s')->setParameter('s', '%' . strtolower($params['search']) . '%');
        }
        $countQb = clone $qb;
        $total = (int) $countQb->select('COUNT(d.id)')->getQuery()->getSingleScalarResult();
        $items = $qb->orderBy("d.{$params['sort_by']}", $params['sort_dir'])->setFirstResult($params['offset'])->setMaxResults($params['per_page'])->getQuery()->getResult();
        return $this->paginated(array_map(fn($d) => $d->toArray(), $items), $total, $params['page'], $params['per_page']);
    }
}
