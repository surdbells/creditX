<?php
declare(strict_types=1);
namespace App\Action\Deposit;

use App\Domain\Repository\DepositAccountRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/** GET /api/deposits/accounts/{id} — fetch one account. Gated by deposits.view. */
final class GetDepositAccountAction
{
    use ApiResponse;
    public function __construct(private readonly DepositAccountRepository $repo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $a = $this->repo->find($args['id'] ?? '');
        if ($a === null) return $this->notFound('Deposit account not found');
        return $this->success($a->toArray());
    }
}
