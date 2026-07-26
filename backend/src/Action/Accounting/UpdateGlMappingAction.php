<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Domain\Entity\GlAccountMapping;
use App\Domain\Repository\{GeneralLedgerRepository, GlAccountMappingRepository};
use App\Infrastructure\Service\{ApiResponse, AuditService, GlMappingRegistry, GlMappingService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * PUT /api/accounting/gl-mappings/{key}
 *
 * Point a loan-lifecycle role at a GL account, or clear it back to the shipped
 * default. Body:
 *   gl_account_id : string  → override the role with this GL
 *                 : null/'' → remove the override (revert to the default code)
 *
 * Upserts the single override row for the role and returns the refreshed role.
 */
final class UpdateGlMappingAction
{
    use ApiResponse;

    public function __construct(
        private readonly GlAccountMappingRepository $mappingRepo,
        private readonly GeneralLedgerRepository $glRepo,
        private readonly GlMappingService $mapping,
        private readonly AuditService $audit,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $key = (string) ($args['key'] ?? '');
        $role = GlMappingRegistry::byKey($key);
        if ($role === null) {
            return $this->notFound('Unknown GL role');
        }

        $data = (array) ($request->getParsedBody() ?? []);
        $rawId = $data['gl_account_id'] ?? null;
        $glId = is_string($rawId) ? trim($rawId) : '';

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
            $request->getAttribute('user_id'),
            'GlAccountMapping',
            $key,
            ['gl_account_id' => $before],
            ['gl_account_id' => $gl?->getId()],
            $this->getClientIp($request),
            $this->getUserAgent($request),
        );

        // Return the refreshed role row (resolver reads fresh rows next request;
        // within this request we describe the row we just wrote).
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
}
