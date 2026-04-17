<?php
declare(strict_types=1);
namespace App\Action\Department;

use App\Domain\Entity\Department;
use App\Domain\Repository\DepartmentRepository;
use App\Domain\Repository\UserRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService};
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class ListDepartmentAction
{
    use ApiResponse;
    public function __construct(
        private readonly DepartmentRepository $repo,
        private readonly UserRepository $userRepo,
        private readonly EntityManagerInterface $em,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $params = $request->getQueryParams();
        $p = $this->getPaginationParams($params);
        $result = $this->repo->paginated($p['offset'], $p['per_page'], $p['sort_by'], $p['sort_dir'], $p['search'] ?: null);
        $items = array_map(fn($d) => $d->toArray(), $result['items']);
        return $this->paginated($items, $result['total'], $p['page'], $p['per_page']);
    }
}
