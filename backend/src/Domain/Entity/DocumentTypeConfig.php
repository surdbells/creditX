<?php

declare(strict_types=1);

namespace App\Domain\Entity;

use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

/**
 * A configurable loan document type (Passport Photograph, ID Card, ...).
 *
 * Replaces the old hardcoded DocumentType enum as the source of truth for
 * WHICH documents exist and WHICH are mandatory, so operations can add a new
 * document or change what blocks submission without a deploy.
 *
 * `code` is what gets stored on Document.type, so it must stay stable once
 * documents reference it — hence editing a code is refused for system rows and
 * discouraged elsewhere (see UpdateDocumentTypeAction).
 *
 * Required-ness is GLOBAL: a type marked required must be present on every loan
 * before it can be submitted for approval, regardless of product or loan type.
 */
#[ORM\Entity]
#[ORM\Table(name: 'document_types')]
#[ORM\UniqueConstraint(name: 'uniq_document_types_code', columns: ['code'])]
#[ORM\HasLifecycleCallbacks]
class DocumentTypeConfig
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    /** Stable machine code stored on Document.type (e.g. 'passport'). */
    #[ORM\Column(type: 'string', length: 30, unique: true)]
    private string $code;

    /** Human label shown in the agent app + admin (e.g. 'Passport Photograph'). */
    #[ORM\Column(type: 'string', length: 100)]
    private string $label;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $description = null;

    /** Must be uploaded before a loan can be submitted for approval. */
    #[ORM\Column(name: 'is_required', type: 'boolean', options: ['default' => false])]
    private bool $isRequired = false;

    /** Inactive types are hidden from capture and never enforced. */
    #[ORM\Column(name: 'is_active', type: 'boolean', options: ['default' => true])]
    private bool $isActive = true;

    /**
     * System types ship with the product and cannot be deleted or re-coded —
     * existing documents reference their code. They can still be toggled
     * required/inactive and relabelled.
     */
    #[ORM\Column(name: 'is_system', type: 'boolean', options: ['default' => false])]
    private bool $isSystem = false;

    /** File picker accept string for the agent app (e.g. 'image/*,.pdf'). */
    #[ORM\Column(type: 'string', length: 100, nullable: true)]
    private ?string $accept = null;

    #[ORM\Column(name: 'sort_order', type: 'integer', options: ['default' => 0])]
    private int $sortOrder = 0;

    public function __construct()
    {
        $this->id = Uuid::uuid4()->toString();
    }

    public function getId(): string { return $this->id; }

    public function getCode(): string { return $this->code; }
    public function setCode(string $v): void { $this->code = strtolower(trim($v)); }

    public function getLabel(): string { return $this->label; }
    public function setLabel(string $v): void { $this->label = trim($v); }

    public function getDescription(): ?string { return $this->description; }
    public function setDescription(?string $v): void { $this->description = $v; }

    public function isRequired(): bool { return $this->isRequired; }
    public function setIsRequired(bool $v): void { $this->isRequired = $v; }

    public function isActive(): bool { return $this->isActive; }
    public function setIsActive(bool $v): void { $this->isActive = $v; }

    public function isSystem(): bool { return $this->isSystem; }
    public function setIsSystem(bool $v): void { $this->isSystem = $v; }

    public function getAccept(): ?string { return $this->accept; }
    public function setAccept(?string $v): void { $this->accept = $v; }

    public function getSortOrder(): int { return $this->sortOrder; }
    public function setSortOrder(int $v): void { $this->sortOrder = $v; }

    public function toArray(): array
    {
        return [
            'id'          => $this->id,
            'code'        => $this->code,
            'label'       => $this->label,
            'description' => $this->description,
            'is_required' => $this->isRequired,
            'is_active'   => $this->isActive,
            'is_system'   => $this->isSystem,
            'accept'      => $this->accept,
            'sort_order'  => $this->sortOrder,
        ];
    }
}
