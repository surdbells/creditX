<?php
declare(strict_types=1);
namespace App\Action\Deposit;

use App\Domain\Exception\DomainException;
use App\Domain\Repository\DepositProductRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService, DepositService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * POST /api/deposits/accounts — open a deposit account for a customer.
 * Optional opening_deposit posts the first DEPOSIT transaction.
 * Gated by deposits.transact.
 */
final class OpenDepositAccountAction
{
    use ApiResponse;

    public function __construct(
        private readonly DepositService $service,
        private readonly DepositProductRepository $productRepo,
        private readonly AuditService $audit,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = (array) ($request->getParsedBody() ?? []);

        $customerId     = trim((string) ($data['customer_id'] ?? ''));
        $productId      = trim((string) ($data['product_id'] ?? ''));
        $openingDeposit = trim((string) ($data['opening_deposit'] ?? '0.00'));
        $postingDate    = trim((string) ($data['posting_date'] ?? date('Y-m-d')));

        $errors = [];
        if ($customerId === '') $errors['customer_id'] = 'Required.';
        if ($productId === '')  $errors['product_id'] = 'Required.';
        if (!empty($errors)) return $this->validationError($errors);

        $product = $this->productRepo->find($productId);
        if ($product === null) return $this->validationError(['product_id' => 'Deposit product not found.']);

        $userId = $request->getAttribute('user_id');

        try {
            $account = $this->service->openAccount($customerId, $product, $openingDeposit, $postingDate, $userId);
        } catch (DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }

        $this->audit->logCreate($userId, 'DepositAccount', $account->getId(), $account->toArray(), $this->getClientIp($request), $this->getUserAgent($request));
        return $this->created($account->toArray(), 'Deposit account opened successfully');
    }
}
