<?php

declare(strict_types=1);

namespace App\Infrastructure\Service;

use App\Domain\Repository\DocumentTypeConfigRepository;
use App\Domain\Repository\ProductDocumentRepository;

/**
 * Answers one question, in one place: which documents does THIS loan product
 * ask for, and which of them block submission?
 *
 * Every consumer goes through here — submit validation, the agent app's upload
 * checklist, the customer portal, and back-office capture — so the four can
 * never disagree about what a loan needs.
 *
 * Resolution:
 *   product HAS its own list  → that list wins outright, including is_required.
 *                               A product may ask for fewer documents than the
 *                               catalogue defaults to, or mark a
 *                               globally-required one optional.
 *   product has NO list       → the global catalogue's active types apply with
 *                               their own defaults. This is what keeps every
 *                               product that predates the feature working
 *                               unchanged, with no backfill.
 */
final class DocumentRequirementService
{
    public function __construct(
        private readonly ProductDocumentRepository $productDocs,
        private readonly DocumentTypeConfigRepository $docTypes,
    ) {}

    /**
     * The full document list for a product, resolved.
     *
     * @param string|null $productId null (a loan with no product yet) falls back
     *                    to the global catalogue.
     * @return array<int, array<string, mixed>>
     */
    public function forProduct(?string $productId): array
    {
        if ($productId !== null) {
            $rows = $this->productDocs->forProduct($productId);
            if ($rows !== []) {
                // Inactive catalogue types are dropped even when a product
                // lists them: deactivating a document type must retire it
                // everywhere, which is the safe way to withdraw one.
                return array_values(array_map(
                    static fn($pd) => $pd->toArray(),
                    array_filter($rows, static fn($pd) => $pd->getDocumentType()->isActive()),
                ));
            }
        }

        return array_map(static fn($dt) => [
            'id'               => null,
            'document_type_id' => $dt->getId(),
            'code'             => $dt->getCode(),
            'label'            => $dt->getLabel(),
            'description'      => $dt->getDescription(),
            'accept'           => $dt->getAccept(),
            'is_required'      => $dt->isRequired(),
            'sort_order'       => $dt->getSortOrder(),
            'global_required'  => $dt->isRequired(),
            'is_active'        => true,
            // Marks the list as inherited rather than configured, so the UI can
            // say "using the global defaults" instead of implying a choice.
            'inherited'        => true,
        ], $this->docTypes->findActive());
    }

    /**
     * Just the blocking ones, as code => label. This is what submit-for-approval
     * checks against.
     *
     * @return array<string, string>
     */
    public function requiredForProduct(?string $productId): array
    {
        $out = [];
        foreach ($this->forProduct($productId) as $doc) {
            if (!empty($doc['is_required'])) {
                $out[(string) $doc['code']] = (string) $doc['label'];
            }
        }
        return $out;
    }

    /** True when the product has departed from the global catalogue. */
    public function isConfigured(?string $productId): bool
    {
        return $productId !== null && $this->productDocs->forProduct($productId) !== [];
    }
}
