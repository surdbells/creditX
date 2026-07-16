<?php
declare(strict_types=1);
namespace App\Action\DocumentType;

use App\Domain\Entity\DocumentTypeConfig;
use App\Domain\Repository\DocumentTypeConfigRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService, InputValidator};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * POST /api/document-types — add a new loan document type.
 */
final class CreateDocumentTypeAction
{
    use ApiResponse;

    public function __construct(
        private readonly DocumentTypeConfigRepository $repo,
        private readonly AuditService $audit,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = (array) ($request->getParsedBody() ?? []);
        $v = InputValidator::validate($data, [
            'code'        => ['required' => true, 'type' => 'string', 'min' => 2, 'max' => 30],
            'label'       => ['required' => true, 'type' => 'string', 'min' => 2, 'max' => 100],
            'description' => ['required' => false, 'type' => 'string', 'max' => 500],
            'accept'      => ['required' => false, 'type' => 'string', 'max' => 100],
            'sort_order'  => ['required' => false, 'type' => 'int', 'min' => 0],
        ]);
        if (!empty($v['errors'])) return $this->validationError($v['errors']);

        $clean = $v['clean'];

        // The code is stored on every Document row, so it must be a stable,
        // predictable slug — reject anything that isn't.
        $code = strtolower(trim($clean['code']));
        if (!preg_match('/^[a-z0-9_]+$/', $code)) {
            return $this->validationError(['code' => 'Code may only contain lowercase letters, numbers and underscores (e.g. utility_bill).']);
        }
        if ($this->repo->codeExists($code)) {
            return $this->validationError(['code' => 'A document type with this code already exists.']);
        }

        $dt = new DocumentTypeConfig();
        $dt->setCode($code);
        $dt->setLabel($clean['label']);
        $dt->setDescription($clean['description'] ?? null);
        $dt->setAccept($clean['accept'] ?? null);
        $dt->setSortOrder((int) ($clean['sort_order'] ?? 0));
        $dt->setIsRequired(filter_var($data['is_required'] ?? false, FILTER_VALIDATE_BOOLEAN));
        $dt->setIsActive(filter_var($data['is_active'] ?? true, FILTER_VALIDATE_BOOLEAN));
        $dt->setIsSystem(false); // only seeded types are system types

        $this->repo->save($dt);
        $this->audit->logCreate($request->getAttribute('user_id'), 'DocumentType', $dt->getId(), $dt->toArray(), $this->getClientIp($request), $this->getUserAgent($request));

        return $this->created($dt->toArray(), 'Document type created');
    }
}
