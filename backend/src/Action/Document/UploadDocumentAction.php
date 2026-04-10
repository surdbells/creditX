<?php
declare(strict_types=1);
namespace App\Action\Document;

use App\Domain\Enum\DocumentType;
use App\Domain\Repository\CustomerRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService, DocumentService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class UploadDocumentAction
{
    use ApiResponse;
    public function __construct(
        private readonly CustomerRepository $customerRepo,
        private readonly DocumentService $docService,
        private readonly AuditService $audit,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $uploadedFiles = $request->getUploadedFiles();
        $file = $uploadedFiles['file'] ?? null;
        if ($file === null || $file->getError() !== UPLOAD_ERR_OK) {
            return $this->validationError(['file' => 'File is required']);
        }

        $params = (array) ($request->getParsedBody() ?? []);
        $customerId = $params['customer_id'] ?? '';
        if ($customerId === '') return $this->validationError(['customer_id' => 'Customer ID is required']);

        $customer = $this->customerRepo->find($customerId);
        if ($customer === null) return $this->notFound('Customer not found');

        $typeValue = $params['type'] ?? DocumentType::OTHER->value;
        $docType = DocumentType::tryFrom($typeValue);
        if ($docType === null) {
            return $this->validationError(['type' => 'Invalid document type. Allowed: ' . implode(', ', array_column(DocumentType::cases(), 'value'))]);
        }

        $loanId = $params['loan_id'] ?? null;
        $uploadedBy = $request->getAttribute('user_id');

        try {
            $doc = $this->docService->upload($file, $customer, $docType, $loanId, $uploadedBy);
        } catch (\RuntimeException $e) {
            return $this->error($e->getMessage(), 400);
        }

        $this->audit->logCreate($uploadedBy, 'Document', $doc->getId(), $doc->toArray(), $this->getClientIp($request), $this->getUserAgent($request));
        return $this->created($doc->toArray(), 'Document uploaded successfully');
    }
}
