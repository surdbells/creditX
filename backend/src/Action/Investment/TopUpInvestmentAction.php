<?php
declare(strict_types=1);
namespace App\Action\Investment;

use App\Domain\Exception\DomainException;
use App\Domain\Repository\InvestmentRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService, InvestmentService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * POST /api/investments/{id}/top-up — add to an open-ended investment.
 * Gated by investments.transact. Body: amount, settlement_gl_id, value_date.
 */
final class TopUpInvestmentAction
{
    use ApiResponse;

    public function __construct(
        private readonly InvestmentService $service,
        private readonly InvestmentRepository $repo,
        private readonly AuditService $audit,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $inv = $this->repo->find($args['id'] ?? '');
        if ($inv === null) return $this->notFound('Investment not found');

        $data = (array) ($request->getParsedBody() ?? []);
        $amount     = trim((string) ($data['amount'] ?? ''));
        $settlement = trim((string) ($data['settlement_gl_id'] ?? ''));
        $date       = trim((string) ($data['value_date'] ?? date('Y-m-d')));

        $errors = [];
        if ($amount === '')     $errors['amount'] = 'Required.';
        if ($settlement === '') $errors['settlement_gl_id'] = 'Required.';
        if ($errors) return $this->validationError($errors);

        $userId = $request->getAttribute('user_id');
        try {
            $txn = $this->service->topUp($inv, $amount, $date, $settlement, $userId);
        } catch (DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }

        $this->audit->logCreate($userId, 'InvestmentTransaction', $txn->getId(), $txn->toArray(), $this->getClientIp($request), $this->getUserAgent($request));
        return $this->created($txn->toArray() + ['investment' => $inv->toArray()], 'Top-up posted successfully');
    }
}
