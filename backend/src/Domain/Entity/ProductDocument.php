<?php

declare(strict_types=1);

namespace App\Domain\Entity;

use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

/**
 * Which documents a specific loan product asks for, and which of them block
 * submission for THAT product.
 *
 * The global document_types table stays the catalogue — the list of documents
 * that exist, each with a sensible default for whether it is required. This
 * table lets a product depart from those defaults.
 *
 * Resolution (see DocumentRequirementService):
 *   - a product WITH rows here: this list is authoritative, including
 *     is_required. A product may therefore ask for fewer documents than the
 *     catalogue defaults to, or mark a globally-required one as optional.
 *   - a product with NO rows: the global defaults apply unchanged, so every
 *     product that existed before this feature keeps behaving exactly as it did.
 *
 * The full-override behaviour is deliberate and was chosen explicitly: it is
 * what lets one product demand a payslip while another does not. The
 * consequence is that the catalogue's is_required is a DEFAULT, not a
 * guarantee — a compliance document can be relaxed per product, so the product
 * form says so where an operator will see it.
 */
#[ORM\Entity]
#[ORM\Table(name: 'product_documents')]
#[ORM\UniqueConstraint(name: 'uniq_product_document', columns: ['loan_product_id', 'document_type_id'])]
#[ORM\Index(name: 'idx_product_documents_product', columns: ['loan_product_id'])]
#[ORM\HasLifecycleCallbacks]
class ProductDocument
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\ManyToOne(targetEntity: LoanProduct::class)]
    #[ORM\JoinColumn(name: 'loan_product_id', referencedColumnName: 'id', nullable: false, onDelete: 'CASCADE')]
    private LoanProduct $product;

    #[ORM\ManyToOne(targetEntity: DocumentTypeConfig::class)]
    #[ORM\JoinColumn(name: 'document_type_id', referencedColumnName: 'id', nullable: false, onDelete: 'CASCADE')]
    private DocumentTypeConfig $documentType;

    /** Blocks submit-for-approval on this product when true. */
    #[ORM\Column(name: 'is_required', type: 'boolean', options: ['default' => false])]
    private bool $isRequired = false;

    #[ORM\Column(name: 'sort_order', type: 'integer', options: ['default' => 0])]
    private int $sortOrder = 0;

    public function __construct()
    {
        $this->id = Uuid::uuid4()->toString();
    }

    public function getId(): string { return $this->id; }

    public function getProduct(): LoanProduct { return $this->product; }
    public function setProduct(LoanProduct $v): void { $this->product = $v; }

    public function getDocumentType(): DocumentTypeConfig { return $this->documentType; }
    public function setDocumentType(DocumentTypeConfig $v): void { $this->documentType = $v; }

    public function isRequired(): bool { return $this->isRequired; }
    public function setIsRequired(bool $v): void { $this->isRequired = $v; }

    public function getSortOrder(): int { return $this->sortOrder; }
    public function setSortOrder(int $v): void { $this->sortOrder = $v; }

    public function toArray(): array
    {
        $dt = $this->documentType;
        return [
            'id'               => $this->id,
            'document_type_id' => $dt->getId(),
            'code'             => $dt->getCode(),
            'label'            => $dt->getLabel(),
            'description'      => $dt->getDescription(),
            'accept'           => $dt->getAccept(),
            'is_required'      => $this->isRequired,
            'sort_order'       => $this->sortOrder,
            // How the catalogue would have treated it, so the UI can show when
            // a product has departed from the default.
            'global_required'  => $dt->isRequired(),
            'is_active'        => $dt->isActive(),
        ];
    }
}
