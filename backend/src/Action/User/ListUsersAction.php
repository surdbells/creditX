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

        // is_agent query param: accept 'true'/'false' strings and coerce.
        // Absence of the param (or any other value) = no filter applied.
        $isAgent = null;
        if (array_key_exists('is_agent', $params)) {
            $raw = strtolower((string) $params['is_agent']);
            if ($raw === 'true' || $raw === '1') $isAgent = true;
            elseif ($raw === 'false' || $raw === '0') $isAgent = false;
        }

        $result = $this->userRepo->paginated(
            $pagination['offset'],
            $pagination['per_page'],
            $pagination['sort_by'],
            $pagination['sort_dir'],
            $pagination['search'] ?: null,
            $params['status'] ?? null,
            $params['role'] ?? null,
            $isAgent,
        );

        $items = array_map(fn($u) => $u->toArray(true), $result['items']);

        return $this->paginated($items, $result['total'], $pagination['page'], $pagination['per_page']);
    }
}
