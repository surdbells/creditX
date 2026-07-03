<?php
declare(strict_types=1);
namespace App\Action\Loan;

use App\Domain\Entity\User;
use App\Domain\Repository\LoanRepository;
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class ListLoansAction
{
    use ApiResponse;
    public function __construct(
        private readonly LoanRepository $repo,
        private readonly EntityManagerInterface $em,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $params = $request->getQueryParams();
        $p = $this->getPaginationParams($params);

        $agentId  = $params['agent_id'] ?? null;
        $branchId = $params['branch_id'] ?? null;

        // Field agents may only ever see their own jobs. Enforce it here (not
        // via client-supplied params, which can't be trusted): if the caller
        // is flagged is_agent, force the agent filter to their own id and drop
        // any branch filter regardless of what the request asked for.
        $userId = $request->getAttribute('user_id');
        $user = $userId ? $this->em->find(User::class, $userId) : null;
        if ($user instanceof User && $user->isAgent()) {
            $agentId  = $userId;
            $branchId = null;
        }

        $result = $this->repo->paginated($p['offset'], $p['per_page'], $p['sort_by'], $p['sort_dir'], $p['search'] ?: null,
            $params['status'] ?? null, $params['product_id'] ?? null, $branchId, $agentId);
        $items = array_map(fn($l) => $l->toArray(), $result['items']);
        return $this->paginated($items, $result['total'], $p['page'], $p['per_page']);
    }
}
