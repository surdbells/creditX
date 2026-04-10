<?php
declare(strict_types=1);
namespace App\Action\Document;

use App\Domain\Repository\DocumentRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService, DocumentService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class DeleteDocumentAction
{
    use ApiResponse;
    public function __construct(
        private readonly DocumentRepository $repo,
        private readonly DocumentService $docService,
        private readonly AuditService $audit,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $doc = $this->repo->find($args['id'] ?? '');
        if ($doc === null) return $this->notFound('Document not found');

        $old = $doc->toArray();
        $this->docService->delete($doc);

        $this->audit->logDelete($request->getAttribute('user_id'), 'Document', $args['id'], $old, $this->getClientIp($request), $this->getUserAgent($request));
        return $this->success(null, 'Document deleted successfully');
    }
}
