<?php
declare(strict_types=1);
namespace App\Action\Investment;

use App\Domain\Exception\DomainException;
use App\Domain\Repository\InvestmentProductRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService, InvestmentService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * POST /api/investments — place a new investment.
 * Gated by investments.transact.
 *
 * Body: product_id, customer_id, amount, settlement_gl_id,
 *       tenor_days (fixed-term only), placement_date, auto_rollover,
 *       payout_deposit_account_id.
 */
final class PlaceInvestmentAction
{
    use ApiResponse;

    public function __construct(
        private readonly InvestmentService $service,
        private readonly InvestmentProductRepository $productRepo,
        private readonly AuditService $audit,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = (array) ($request->getParsedBody() ?? []);

        $productId  = trim((string) ($data['product_id'] ?? ''));
        $customerId = trim((string) ($data['customer_id'] ?? ''));
        $amount     = trim((string) ($data['amount'] ?? ''));
        $settlement = trim((string) ($data['settlement_gl_id'] ?? ''));
        $date       = trim((string) ($data['placement_date'] ?? date('Y-m-d')));

        $errors = [];
        if ($productId === '')  $errors['product_id'] = 'Required.';
        if ($customerId === '') $errors['customer_id'] = 'Required.';
        if ($amount === '')     $errors['amount'] = 'Required.';
        if ($settlement === '') $errors['settlement_gl_id'] = 'Required — the bank/cash account the funds arrive in.';
        if ($errors) return $this->validationError($errors);

        $product = $this->productRepo->find($productId);
        if ($product === null) return $this->validationError(['product_id' => 'Investment product not found.']);

        $tenor = isset($data['tenor_days']) && $data['tenor_days'] !== '' ? (int) $data['tenor_days'] : null;
        $autoRollover = array_key_exists('auto_rollover', $data)
            ? filter_var($data['auto_rollover'], FILTER_VALIDATE_BOOLEAN)
            : null;
        $payoutAccount = isset($data['payout_deposit_account_id']) && $data['payout_deposit_account_id'] !== ''
            ? (string) $data['payout_deposit_account_id']
            : null;

        $userId = $request->getAttribute('user_id');
        try {
            $inv = $this->service->place(
                $product, $customerId, $amount, $tenor, $date, $settlement, $userId,
                $autoRollover, $payoutAccount,
            );
        } catch (DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }

        $this->audit->logCreate($userId, 'Investment', $inv->getId(), $inv->toArray(), $this->getClientIp($request), $this->getUserAgent($request));
        return $this->created($inv->toArray(), 'Investment placed successfully');
    }
}
