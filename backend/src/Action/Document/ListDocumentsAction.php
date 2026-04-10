<?php
declare(strict_types=1);
namespace App\Action\Document;

use App\Domain\Repository\DocumentRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class ListDocumentsAction
{
    use ApiResponse;
    public function __construct(private readonly DocumentRepository $repo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $params = $request->getQueryParams();
        $customerId = $params['customer_id'] ?? null;
        $loanId = $params['loan_id'] ?? null;

        if ($customerId) {
            $docs = $this->repo->findByCustomer($customerId);
        } elseif ($loanId) {
            $docs = $this->repo->findByLoan($loanId);
        } else {
            return $this->validationError(['filter' => 'customer_id or loan_id query parameter is required']);
        }

        $items = array_map(fn($d) => $d->toArray(), $docs);
        return $this->success($items);
    }
}
