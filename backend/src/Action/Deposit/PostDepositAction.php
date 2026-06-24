<?php
declare(strict_types=1);
namespace App\Action\Deposit;

use App\Domain\Exception\DomainException;
use App\Domain\Repository\DepositAccountRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService, DepositService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * POST /api/deposits/accounts/{id}/deposit — pay money into an account.
 * Gated by deposits.transact.
 */
final class PostDepositAction
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

        $data = (array) ($request->getParsedBody() ?? []);
        $amount      = trim((string) ($data['amount'] ?? ''));
        $postingDate = trim((string) ($data['posting_date'] ?? date('Y-m-d')));
        $reference   = isset($data['reference']) ? trim((string) $data['reference']) : null;

        if ($amount === '') return $this->validationError(['amount' => 'Required.']);

        $userId = $request->getAttribute('user_id');
        try {
            $txn = $this->service->deposit($account, $amount, $postingDate, $reference ?: null, $userId);
        } catch (DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }

        $this->audit->logCreate($userId, 'DepositTransaction', $txn->getId(), $txn->toArray(), $this->getClientIp($request), $this->getUserAgent($request));
        return $this->created($txn->toArray(), 'Deposit posted successfully');
    }
}
