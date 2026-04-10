<?php
declare(strict_types=1);
namespace App\Action\LoanProduct;

use App\Domain\Repository\LoanProductRepository;
use App\Infrastructure\Service\{ApiResponse, LoanCalculationService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class CalculateAction
{
    use ApiResponse;
    public function __construct(
        private readonly LoanProductRepository $productRepo,
        private readonly LoanCalculationService $calcService,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = (array) ($request->getParsedBody() ?? []);
        $productId = $data['product_id'] ?? '';
        $amount = $data['amount'] ?? '';
        $tenure = (int) ($data['tenure'] ?? 0);
        $bankStatementMode = $data['bank_statement_mode'] ?? null;
        $oldLoanBalance = $data['old_loan_balance'] ?? '0';

        if ($productId === '' || $amount === '' || $tenure < 1) {
            return $this->validationError(['product_id' => 'Required', 'amount' => 'Required', 'tenure' => 'Must be >= 1']);
        }

        $product = $this->productRepo->find($productId);
        if ($product === null) return $this->notFound('Loan product not found');
        if (!$product->isActive()) return $this->error('Loan product is inactive', 400);

        // Validate amount/tenure against product limits
        if ((float) $amount < (float) $product->getMinAmount() || (float) $amount > (float) $product->getMaxAmount()) {
            return $this->validationError(['amount' => "Amount must be between {$product->getMinAmount()} and {$product->getMaxAmount()}"]);
        }
        if ($tenure < $product->getMinTenure() || $tenure > $product->getMaxTenure()) {
            return $this->validationError(['tenure' => "Tenure must be between {$product->getMinTenure()} and {$product->getMaxTenure()} months"]);
        }

        $result = $this->calcService->calculate($product, $amount, $tenure, $bankStatementMode, $oldLoanBalance);
        return $this->success($result, 'Loan calculated successfully');
    }
}
