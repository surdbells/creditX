<?php

declare(strict_types=1);

namespace App\Action\Auth;

use App\Domain\Repository\UserRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

final class MeAction
{
    use ApiResponse;

    public function __construct(
        private readonly UserRepository $userRepo,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $userId = $request->getAttribute('user_id');
        $user = $this->userRepo->find($userId);

        if ($user === null) {
            return $this->notFound('User not found');
        }

        return $this->success($user->toArray(true));
    }
}
