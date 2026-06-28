<?php
declare(strict_types=1);
namespace App\Action\Payment;

use App\Infrastructure\Service\{ApiResponse, LoanPayoffService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Loan payoff (early settlement / liquidation):
 *   GET  /api/loans/{loanId}/payoff/quote   — read-only breakdown
 *   POST /api/loans/{loanId}/payoff          { mode: 'full'|'partial', payoff_gl_code? }
 */
final class LoanPayoffAction
{
    use ApiResponse;

    public function __construct(private readonly LoanPayoffService $service) {}

    public function quote(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        try {
            return $this->success($this->service->quote($args['loanId'] ?? ''));
        } catch (\App\Domain\Exception\DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }
    }

    public function settle(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $userId = $request->getAttribute('user_id');
        if ($userId === null) return $this->unauthorized();
        $b = (array) ($request->getParsedBody() ?? []);
        $mode = (string) ($b['mode'] ?? 'full');
        try {
            $r = $this->service->settle(
                $args['loanId'] ?? '',
                $mode,
                isset($b['payoff_gl_code']) ? (string) $b['payoff_gl_code'] : null,
                $userId,
            );
        } catch (\App\Domain\Exception\DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }
        return $this->success($r, $r['message'] ?? 'Payoff processed');
    }
}
