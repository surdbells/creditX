<?php

declare(strict_types=1);

namespace App\Infrastructure\Service;

use App\Domain\Entity\GeneralLedger;
use App\Domain\Entity\GlAccountMapping;
use App\Domain\Exception\DomainException;
use App\Domain\Repository\FeeTypeRepository;
use App\Domain\Repository\GeneralLedgerRepository;
use App\Domain\Repository\GlAccountMappingRepository;

/**
 * Resolves the GL account a loan-lifecycle posting should use.
 *
 * The posting services no longer hardcode findByCode('LR'); they ask this
 * service for a role (see GlMappingRegistry). Resolution order for a role:
 *
 *   1. an operator override in gl_account_mappings, if set;
 *   2. otherwise the role's historic default code, via findByCode().
 *
 * Because step 2 returns exactly what the services used to look up, wiring a
 * service through this resolver is behaviour-preserving until an operator
 * points a role somewhere else on the Default Ledgers page.
 *
 * resolveByCode() is the drop-in used at existing call sites: pass the default
 * code the service already hardcoded and it applies any override for the role
 * that owns that code, else falls back to findByCode(code) — so unmapped
 * behaviour is identical.
 *
 * Override rows are loaded once per request and cached on the instance (the
 * service is a per-request singleton).
 */
final class GlMappingService
{
    /** @var array<string, GlAccountMapping>|null role key => override row */
    private ?array $overrides = null;

    /** Synthetic role-key prefix for fee-income entries (key = "fee:<feeTypeId>"). */
    public const FEE_KEY_PREFIX = 'fee:';

    public function __construct(
        private readonly GlAccountMappingRepository $mappingRepo,
        private readonly GeneralLedgerRepository $glRepo,
        private readonly FeeTypeRepository $feeTypeRepo,
    ) {}

    /**
     * Resolve by role key. Returns null if neither an override nor the default
     * code resolves to a GL (caller decides whether that is fatal, matching the
     * old per-service null checks).
     */
    public function resolve(string $roleKey): ?GeneralLedger
    {
        if (!GlMappingRegistry::isRole($roleKey)) {
            throw new DomainException("Unknown GL role '{$roleKey}'");
        }

        $override = $this->overrides()[$roleKey] ?? null;
        if ($override !== null && $override->getGlAccount() !== null) {
            return $override->getGlAccount();
        }

        $code = GlMappingRegistry::defaultCode($roleKey);
        return $code !== null ? $this->glRepo->findByCode($code) : null;
    }

    /**
     * Resolve by role key, throwing a clear error if unresolved. Use where the
     * old code did `if ($gl === null) throw ...`.
     */
    public function resolveOrFail(string $roleKey): GeneralLedger
    {
        $gl = $this->resolve($roleKey);
        if ($gl === null) {
            $role = GlMappingRegistry::byKey($roleKey);
            $label = $role['label'] ?? $roleKey;
            $code = $role['default_code'] ?? '?';
            throw new DomainException(
                "No GL account is configured for '{$label}'. Set it on the Default Ledgers page, "
              . "or seed a GL with account code '{$code}'."
            );
        }
        return $gl;
    }

    /**
     * Drop-in for findByCode() at a mapped call site. If $defaultCode belongs to
     * a known role, apply that role's override (when set); otherwise, and when
     * unmapped, fall back to findByCode($defaultCode) — identical to before.
     */
    public function resolveByCode(string $defaultCode): ?GeneralLedger
    {
        $roleKey = GlMappingRegistry::keyForCode($defaultCode);
        if ($roleKey !== null) {
            $override = $this->overrides()[$roleKey] ?? null;
            if ($override !== null && $override->getGlAccount() !== null) {
                return $override->getGlAccount();
            }
        }
        return $this->glRepo->findByCode($defaultCode);
    }

    /**
     * Role list for the admin page: registry metadata + the currently resolved
     * account and whether it is an explicit override or the default.
     *
     * @return list<array<string, mixed>>
     */
    public function list(): array
    {
        $overrides = $this->overrides();
        $out = [];
        foreach (GlMappingRegistry::all() as $role) {
            $override = $overrides[$role['key']] ?? null;
            $overrideGl = $override?->getGlAccount();
            $resolved = $overrideGl ?? $this->glRepo->findByCode($role['default_code']);

            $out[] = [
                'key'            => $role['key'],
                'label'          => $role['label'],
                'category'       => $role['category'],
                'stage'          => $role['stage'],
                'description'    => $role['description'],
                'default_code'   => $role['default_code'],
                'gl_account_id'  => $overrideGl?->getId(),        // explicit override, or null
                'is_overridden'  => $overrideGl !== null,
                'resolved'       => $resolved?->toArray(),         // what actually posts today
                'is_configured'  => $resolved !== null,            // false = neither override nor default GL exists
                'updated_at'     => $override?->getUpdatedAt()->format('Y-m-d H:i:s'),
            ];
        }

        // Fee income accounts are per-fee-type (FeeType.glAccountId), not role
        // rows — surface each active fee here so every income GL a loan touches
        // is visible and editable in one place. Key = "fee:<feeTypeId>".
        foreach ($this->feeTypeRepo->findActive() as $ft) {
            $out[] = $this->feeRow($ft);
        }

        return $out;
    }

    /**
     * Build a Default-Ledgers row for a fee type. A fee resolves to its own
     * glAccountId if set, else a GL matching its code — exactly what
     * DisbursementService uses to post the fee's income credit.
     *
     * @return array<string, mixed>
     */
    public function feeRow(\App\Domain\Entity\FeeType $ft): array
    {
        $overrideGl = $ft->getGlAccountId() ? $this->glRepo->find($ft->getGlAccountId()) : null;
        $resolved = $overrideGl ?? $this->glRepo->findByCode($ft->getCode());

        return [
            'key'           => self::FEE_KEY_PREFIX . $ft->getId(),
            'label'         => $ft->getName(),
            'category'      => 'Fee Income',
            'stage'         => 'Disbursement',
            'description'   => 'Income account credited when the ' . $ft->getName() . ' is charged at disbursement.',
            'default_code'  => $ft->getCode(),
            'gl_account_id' => $overrideGl?->getId(),
            'is_overridden' => $overrideGl !== null,
            'resolved'      => $resolved?->toArray(),
            'is_configured' => $resolved !== null,
            'updated_at'    => $ft->getUpdatedAt()->format('Y-m-d H:i:s'),
        ];
    }

    /** @return array<string, GlAccountMapping> */
    private function overrides(): array
    {
        if ($this->overrides === null) {
            $this->overrides = $this->mappingRepo->allByRoleKey();
        }
        return $this->overrides;
    }
}
