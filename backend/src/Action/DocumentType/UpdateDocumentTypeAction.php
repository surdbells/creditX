<?php
declare(strict_types=1);
namespace App\Action\DocumentType;

use App\Domain\Repository\DocumentTypeConfigRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * PUT /api/document-types/{id} — edit a document type (label, required, active,
 * accept, order). This is how operations turns a document into a submit
 * blocker, or retires one, without a deploy.
 */
final class UpdateDocumentTypeAction
{
    use ApiResponse;

    public function __construct(
        private readonly DocumentTypeConfigRepository $repo,
        private readonly AuditService $audit,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $dt = $this->repo->find($args['id'] ?? '');
        if ($dt === null) return $this->notFound('Document type not found');

        $before = $dt->toArray();
        $data = (array) ($request->getParsedBody() ?? []);

        // The code is referenced by existing Document rows — changing it would
        // orphan them (uploaded docs would no longer satisfy the requirement).
        // Allow it only while nothing depends on it: never for system types.
        if (isset($data['code']) && strtolower(trim((string) $data['code'])) !== $dt->getCode()) {
            if ($dt->isSystem()) {
                return $this->error('The code of a system document type cannot be changed.', 422);
            }
            $code = strtolower(trim((string) $data['code']));
            if (!preg_match('/^[a-z0-9_]+$/', $code)) {
                return $this->validationError(['code' => 'Code may only contain lowercase letters, numbers and underscores.']);
            }
            if ($this->repo->codeExists($code, $dt->getId())) {
                return $this->validationError(['code' => 'A document type with this code already exists.']);
            }
            $dt->setCode($code);
        }

        if (isset($data['label']) && trim((string) $data['label']) !== '') $dt->setLabel((string) $data['label']);
        if (array_key_exists('description', $data)) $dt->setDescription($data['description'] ?: null);
        if (array_key_exists('accept', $data)) $dt->setAccept($data['accept'] ?: null);
        if (isset($data['sort_order'])) $dt->setSortOrder((int) $data['sort_order']);
        if (array_key_exists('is_required', $data)) $dt->setIsRequired(filter_var($data['is_required'], FILTER_VALIDATE_BOOLEAN));
        if (array_key_exists('is_active', $data)) $dt->setIsActive(filter_var($data['is_active'], FILTER_VALIDATE_BOOLEAN));

        $this->repo->flush();
        $this->audit->logUpdate($request->getAttribute('user_id'), 'DocumentType', $dt->getId(), $before, $dt->toArray(), $this->getClientIp($request), $this->getUserAgent($request));

        return $this->success($dt->toArray(), 'Document type updated');
    }
}
