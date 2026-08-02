<?php
declare(strict_types=1);
namespace App\Action\LoanProduct;

use App\Domain\Repository\LoanProductRepository;
use App\Infrastructure\Service\{ApiResponse, DocumentRequirementService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GET /api/loan-products/{id}/documents
 *
 * The resolved document list for a product — the product's own configuration
 * if it has one, otherwise the global catalogue. This is the single source the
 * agent app's upload checklist, the customer portal and back-office capture all
 * read, so none of them can drift from what submit-for-approval enforces.
 *
 * `configured` tells the caller whether the product has its own list or is
 * inheriting, which is what lets the admin UI say "using global defaults"
 * rather than implying someone chose this.
 *
 * Gated by products.view so field agents, who already hold it, can build their
 * checklist from the live configuration.
 */
final class GetProductDocumentsAction
{
    use ApiResponse;

    public function __construct(
        private readonly LoanProductRepository $products,
        private readonly DocumentRequirementService $requirements,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $id = (string) ($args['id'] ?? '');
        if ($this->products->find($id) === null) {
            return $this->notFound('Loan product not found');
        }

        return $this->success([
            'product_id' => $id,
            'configured' => $this->requirements->isConfigured($id),
            'documents'  => $this->requirements->forProduct($id),
        ]);
    }
}
