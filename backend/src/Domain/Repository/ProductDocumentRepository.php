<?php
declare(strict_types=1);
namespace App\Domain\Repository;

use App\Domain\Entity\ProductDocument;

class ProductDocumentRepository extends BaseRepository
{
    protected function getEntityClass(): string { return ProductDocument::class; }

    /**
     * A product's own document list, ordered for display. Empty means the
     * product has not been configured and the global catalogue applies.
     *
     * @return ProductDocument[]
     */
    public function forProduct(string $productId): array
    {
        return $this->em->createQueryBuilder()->select('pd', 'dt')->from(ProductDocument::class, 'pd')
            ->join('pd.documentType', 'dt')
            ->where('pd.product = :p')->setParameter('p', $productId)
            ->orderBy('pd.sortOrder', 'ASC')->addOrderBy('dt.label', 'ASC')
            ->getQuery()->getResult();
    }

    /** Drop a product's whole list — the replace half of a PUT. */
    public function clearForProduct(string $productId): void
    {
        $this->em->createQueryBuilder()->delete(ProductDocument::class, 'pd')
            ->where('pd.product = :p')->setParameter('p', $productId)
            ->getQuery()->execute();
    }
}
