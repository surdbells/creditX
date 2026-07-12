<?php
declare(strict_types=1);
namespace App\Action\Payment;

use App\Infrastructure\Service\{ApiResponse, SettlementService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Flutterwave webhook endpoint (public, verified by the verif-hash header).
 * Currently handles transfer (settlement) completion events; other events are
 * acknowledged and ignored. Verification + reconciliation live in
 * SettlementService so this action stays a thin adapter.
 */
final class FlutterwaveWebhookAction
{
    use ApiResponse;

    public function __construct(
        private readonly SettlementService $settlementService,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $body = (string) $request->getBody();
        $payload = json_decode($body, true);
        if (!is_array($payload)) {
            return $this->success(null, 'Ignored');
        }

        $ok = $this->settlementService->handleWebhook('flutterwave', $body, $request->getHeaders(), $payload);
        if (!$ok) {
            return $this->error('Invalid signature', 400);
        }
        return $this->success(null, 'Processed');
    }
}
