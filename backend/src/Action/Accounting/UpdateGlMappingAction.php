<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Domain\Entity\GlAccountMapping;
use App\Domain\Repository\{FeeTypeRepository, GeneralLedgerRepository, GlAccountMappingRepository};
use App\Infrastructure\Service\{ApiResponse, AuditService, GlMappingRegistry, GlMappingService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * PUT /api/accounting/gl-mappings/{key}
 *
 * Point a loan-lifecycle role — or a fee's income account — at a GL account,
 * or clear it back to the shipped default. Body:
 *   gl_account_id : string  → set this GL
 *                 : null/'' → remove the override (revert to the default code)
 *
 * Two kinds of key:
 *   - a registry role key (e.g. 'loan.receivable') → upserts a gl_account_mappings row
 *   - a fee key ('fee:<feeTypeId>')                → sets FeeType.glAccountId
 */
final class UpdateGlMappingAction
{
    use ApiResponse;

    public function __construct(
        private readonly GlAccountMappingRepository $mappingRepo,
        private readonly GeneralLedgerRepository $glRepo,
        private readonly FeeTypeRepository $feeTypeRepo,
        private readonly GlMappingService $mapping,
        private readonly AuditService $audit,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $key = (string) ($args['key'] ?? '');

        $data = (array) ($request->getParsedBody() ?? []);
        $rawId = $data['gl_account_id'] ?? null;
        $glId = is_string($rawId) ? trim($rawId) : '';

        // Resolve + validate the target GL (empty = clear/revert to default).
        $gl = null;
        if ($glId !== '') {
            $gl = $this->glRepo->find($glId);
            if ($gl === null) {
                return $this->validationError(['gl_account_id' => 'GL account not found.']);
            }
            if (!$gl->isActive()) {
                return $this->validationError(['gl_account_id' => 'That GL account is inactive.']);
            }
        }

        return str_starts_with($key, GlMappingService::FEE_KEY_PREFIX)
            ? $this->updateFee($request, $key, $gl)
            : $this->updateRole($request, $key, $gl);
    }

    /** Registry role → gl_account_mappings override row. */
    private function updateRole(ServerRequestInterface $request, string $key, $gl): ResponseInterface
    {
        $role = GlMappingRegistry::byKey($key);
        if ($role === null) {
            return $this->notFound('Unknown GL role');
        }

        $row = $this->mappingRepo->findByRoleKey($key);
        $before = $row?->getGlAccount()?->getId();
        if ($row === null) {
            $row = new GlAccountMapping($key);
            $this->mappingRepo->persist($row);
        }
        $row->setGlAccount($gl);
        $row->setUpdatedBy($request->getAttribute('user_id'));
        $this->mappingRepo->flush();

        $this->audit->logUpdate(
            $request->getAttribute('user_id'), 'GlAccountMapping', $key,
            ['gl_account_id' => $before], ['gl_account_id' => $gl?->getId()],
            $this->getClientIp($request), $this->getUserAgent($request),
        );

        $resolved = $gl ?? $this->glRepo->findByCode($role['default_code']);
        return $this->success([
            'key'           => $key,
            'label'         => $role['label'],
            'default_code'  => $role['default_code'],
            'gl_account_id' => $gl?->getId(),
            'is_overridden' => $gl !== null,
            'resolved'      => $resolved?->toArray(),
            'is_configured' => $resolved !== null,
        ], $gl !== null ? 'Ledger mapping updated' : 'Reverted to default ledger');
    }

    /** Fee key → FeeType.glAccountId. */
    private function updateFee(ServerRequestInterface $request, string $key, $gl): ResponseInterface
    {
        $feeId = substr($key, strlen(GlMappingService::FEE_KEY_PREFIX));
        $ft = $this->feeTypeRepo->find($feeId);
        if ($ft === null) {
            return $this->notFound('Unknown fee type');
        }

        $before = $ft->getGlAccountId();
        $ft->setGlAccountId($gl?->getId());
        $this->feeTypeRepo->flush();

        $this->audit->logUpdate(
            $request->getAttribute('user_id'), 'FeeType', $ft->getId(),
            ['gl_account_id' => $before], ['gl_account_id' => $gl?->getId()],
            $this->getClientIp($request), $this->getUserAgent($request),
        );

        // feeRow() re-derives the resolved account exactly as disbursement will.
        return $this->success(
            $this->mapping->feeRow($ft),
            $gl !== null ? 'Fee income account updated' : 'Reverted to default fee account',
        );
    }
}
