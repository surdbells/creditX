<?php

declare(strict_types=1);

namespace App\Action\User;

use App\Domain\Repository\UserRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

final class ListUsersAction
{
    use ApiResponse;

    public function __construct(
        private readonly UserRepository $userRepo,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $params = $request->getQueryParams();
        $pagination = $this->getPaginationParams($params);

        $result = $this->userRepo->paginated(
            $pagination['offset'],
            $pagination['per_page'],
            $pagination['sort_by'],
            $pagination['sort_dir'],
            $pagination['search'] ?: null,
            $params['status'] ?? null,
            $params['role'] ?? null,
        );

        $items = array_map(fn($u) => $u->toArray(true), $result['items']);

        return $this->paginated($items, $result['total'], $pagination['page'], $pagination['per_page']);
    }
}
