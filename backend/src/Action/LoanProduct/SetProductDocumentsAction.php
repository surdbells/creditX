<?php
declare(strict_types=1);
namespace App\Action\LoanProduct;

use App\Domain\Entity\ProductDocument;
use App\Domain\Repository\{DocumentTypeConfigRepository, LoanProductRepository, ProductDocumentRepository};
use App\Infrastructure\Service\{ApiResponse, AuditService, DocumentRequirementService};
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * PUT /api/loan-products/{id}/documents
 *
 * Replace a product's document list wholesale.
 *
 * Body: { documents: [ { document_type_id, is_required?, sort_order? }, ... ] }
 *
 * Sending an EMPTY array is meaningful, not a no-op: it clears the product's
 * configuration so the product goes back to inheriting the global catalogue.
 * That is the only way to undo a per-product override, so it must be
 * expressible.
 *
 * Replace-not-merge is deliberate: the admin form always submits the complete
 * intended list, and a merge would make removing a document impossible without
 * a second delete endpoint.
 *
 * Gated by products.edit.
 */
final class SetProductDocumentsAction
{
    use ApiResponse;

    public function __construct(
        private readonly LoanProductRepository $products,
        private readonly ProductDocumentRepository $productDocs,
        private readonly DocumentTypeConfigRepository $docTypes,
        private readonly DocumentRequirementService $requirements,
        private readonly AuditService $audit,
        private readonly EntityManagerInterface $em,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $id = (string) ($args['id'] ?? '');
        $product = $this->products->find($id);
        if ($product === null) {
            return $this->notFound('Loan product not found');
        }

        $data = (array) ($request->getParsedBody() ?? []);
        if (!array_key_exists('documents', $data) || !is_array($data['documents'])) {
            return $this->validationError(['documents' => 'Expected an array of documents.']);
        }

        // Validate everything BEFORE deleting anything, so a bad payload cannot
        // leave the product with no configuration at all.
        $resolved = [];
        $seen = [];
        foreach ($data['documents'] as $i => $row) {
            $typeId = trim((string) (($row['document_type_id'] ?? '')));
            if ($typeId === '') {
                return $this->validationError(["documents.{$i}.document_type_id" => 'Required.']);
            }
            if (isset($seen[$typeId])) {
                return $this->validationError(["documents.{$i}.document_type_id" => 'This document is listed more than once.']);
            }
            $type = $this->docTypes->find($typeId);
            if ($type === null) {
                return $this->validationError(["documents.{$i}.document_type_id" => 'Unknown document type.']);
            }
            $seen[$typeId] = true;
            $resolved[] = [
                'type'     => $type,
                'required' => filter_var($row['is_required'] ?? false, FILTER_VALIDATE_BOOLEAN),
                'order'    => (int) ($row['sort_order'] ?? $i),
            ];
        }

        $before = $this->requirements->forProduct($id);

        $this->em->beginTransaction();
        try {
            $this->productDocs->clearForProduct($id);
            // Flush the delete before inserting, or the unique constraint on
            // (product, document_type) can fire against rows Doctrine has not
            // yet removed.
            $this->em->flush();

            foreach ($resolved as $r) {
                $pd = new ProductDocument();
                $pd->setProduct($product);
                $pd->setDocumentType($r['type']);
                $pd->setIsRequired($r['required']);
                $pd->setSortOrder($r['order']);
                $pd->setCreatedBy($request->getAttribute('user_id'));
                $this->em->persist($pd);
            }
            $this->em->flush();
            $this->em->commit();
        } catch (\Throwable $e) {
            $this->em->rollback();
            throw $e;
        }

        $after = $this->requirements->forProduct($id);
        $this->audit->logUpdate(
            $request->getAttribute('user_id'), 'LoanProductDocuments', $id,
            ['documents' => $before], ['documents' => $after],
            $this->getClientIp($request), $this->getUserAgent($request),
        );

        return $this->success([
            'product_id' => $id,
            'configured' => $this->requirements->isConfigured($id),
            'documents'  => $after,
        ], $resolved === []
            ? 'Cleared — this product now uses the global document defaults.'
            : 'Document requirements updated for this product.');
    }
}
