<?php

declare(strict_types=1);

namespace App\Domain\Entity;

use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

/**
 * An operator override for one loan-lifecycle GL role.
 *
 * A row exists only when someone has pointed a role (see GlMappingRegistry)
 * at a specific GL account. When no row exists — or glAccount is null — the
 * resolver falls back to the role's default code, so the absence of a row
 * means "use the shipped default".
 *
 * The role's label, category and default code are NOT stored here; the
 * registry is their single source of truth. This table holds only the
 * override target.
 */
#[ORM\Entity]
#[ORM\Table(name: 'gl_account_mappings')]
#[ORM\UniqueConstraint(name: 'uniq_gl_account_mappings_role', columns: ['role_key'])]
#[ORM\HasLifecycleCallbacks]
class GlAccountMapping
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    /** Role key from GlMappingRegistry (e.g. 'loan.receivable'). */
    #[ORM\Column(name: 'role_key', type: 'string', length: 60, unique: true)]
    private string $roleKey;

    /** The GL account this role is pointed at. Null = revert to default code. */
    #[ORM\ManyToOne(targetEntity: GeneralLedger::class)]
    #[ORM\JoinColumn(name: 'gl_account_id', referencedColumnName: 'id', nullable: true, onDelete: 'SET NULL')]
    private ?GeneralLedger $glAccount = null;

    public function __construct(string $roleKey)
    {
        $this->id = Uuid::uuid4()->toString();
        $this->roleKey = $roleKey;
    }

    public function getId(): string { return $this->id; }

    public function getRoleKey(): string { return $this->roleKey; }

    public function getGlAccount(): ?GeneralLedger { return $this->glAccount; }
    public function setGlAccount(?GeneralLedger $v): void { $this->glAccount = $v; }

    // updatedBy / getUpdatedAt etc. come from TimestampsTrait.
}
