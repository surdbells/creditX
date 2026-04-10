<?php

declare(strict_types=1);

namespace App\Action\User;

use App\Domain\Repository\UserRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

final class GetUserAction
{
    use ApiResponse;

    public function __construct(
        private readonly UserRepository $userRepo,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $user = $this->userRepo->find($args['id'] ?? '');

        if ($user === null) {
            return $this->notFound('User not found');
        }

        return $this->success($user->toArray(true));
    }
}
