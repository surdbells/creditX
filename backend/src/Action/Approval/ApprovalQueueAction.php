<?php
declare(strict_types=1);
namespace App\Action\Approval;

use App\Domain\Repository\UserRepository;
use App\Infrastructure\Service\{ApiResponse, ApprovalEngineService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class ApprovalQueueAction
{
    use ApiResponse;
    public function __construct(
        private readonly ApprovalEngineService $engine,
        private readonly UserRepository $userRepo,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $userId = $request->getAttribute('user_id');
        $user = $this->userRepo->find($userId);
        if ($user === null) return $this->unauthorized('User not found');

        $params = $request->getQueryParams();
        $p = $this->getPaginationParams($params);
        $result = $this->engine->getQueue($user, $p['offset'], $p['per_page'], $p['search'] ?: null);

        return $this->paginated($result['items'], $result['total'], $p['page'], $p['per_page']);
    }
}
