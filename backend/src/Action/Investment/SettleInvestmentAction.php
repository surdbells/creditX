<?php
declare(strict_types=1);
namespace App\Action\Investment;

use App\Domain\Exception\DomainException;
use App\Domain\Repository\InvestmentRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService, InvestmentService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Terminal settlement of an investment. One action, three routes, because all
 * three take the same body and differ only in which service call they make:
 *
 *   POST /api/investments/{id}/mature     fixed-term reaching maturity
 *   POST /api/investments/{id}/liquidate  fixed-term exiting early (penalty)
 *   POST /api/investments/{id}/close      open-ended closing out (no penalty)
 *
 * Gated by investments.transact. Body: settlement_gl_id, value_date.
 */
final class SettleInvestmentAction
{
    use ApiResponse;

    public const MODE_MATURE    = 'mature';
    public const MODE_LIQUIDATE = 'liquidate';
    public const MODE_CLOSE     = 'close';

    public function __construct(
        private readonly InvestmentService $service,
        private readonly InvestmentRepository $repo,
        private readonly AuditService $audit,
        private readonly string $mode = self::MODE_MATURE,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $inv = $this->repo->find($args['id'] ?? '');
        if ($inv === null) return $this->notFound('Investment not found');

        $data = (array) ($request->getParsedBody() ?? []);
        $settlement = trim((string) ($data['settlement_gl_id'] ?? ''));
        if ($settlement === '') {
            return $this->validationError(['settlement_gl_id' => 'Required — the bank/cash account the proceeds are paid from.']);
        }
        $date = trim((string) ($data['value_date'] ?? '')) ?: null;

        $before = $inv->toArray();
        $userId = $request->getAttribute('user_id');

        try {
            $inv = match ($this->mode) {
                self::MODE_LIQUIDATE => $this->service->liquidate($inv, $date ?? date('Y-m-d'), $settlement, $userId),
                self::MODE_CLOSE     => $this->service->close($inv, $date ?? date('Y-m-d'), $settlement, $userId),
                default              => $this->service->mature($inv, $settlement, $userId, $date),
            };
        } catch (DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }

        $this->audit->logUpdate($userId, 'Investment', $inv->getId(), $before, $inv->toArray(), $this->getClientIp($request), $this->getUserAgent($request));

        $message = match ($this->mode) {
            self::MODE_LIQUIDATE => 'Investment liquidated early',
            self::MODE_CLOSE     => 'Investment closed',
            default              => 'Investment matured and settled',
        };
        return $this->success($inv->toArray() + ['performance' => $this->service->performance($inv)], $message);
    }
}
