<?php
declare(strict_types=1);
namespace App\Action\Deposit;

use App\Domain\Exception\DomainException;
use App\Domain\Repository\DepositAccountRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService, DepositService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * POST /api/deposits/accounts/{id}/close — close a zero-balance account.
 * Gated by deposits.transact.
 */
final class CloseDepositAccountAction
{
    use ApiResponse;

    public function __construct(
        private readonly DepositService $service,
        private readonly DepositAccountRepository $repo,
        private readonly AuditService $audit,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $account = $this->repo->find($args['id'] ?? '');
        if ($account === null) return $this->notFound('Deposit account not found');

        $before = $account->toArray();
        $userId = $request->getAttribute('user_id');
        try {
            $this->service->closeAccount($account, $userId);
        } catch (DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }

        $this->audit->logUpdate($userId, 'DepositAccount', $account->getId(), $before, $account->toArray(), $this->getClientIp($request), $this->getUserAgent($request));
        return $this->success($account->toArray(), 'Deposit account closed successfully');
    }
}
