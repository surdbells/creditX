<?php
declare(strict_types=1);
namespace App\Action\DocumentType;

use App\Domain\Entity\Document;
use App\Domain\Repository\DocumentTypeConfigRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService};
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * DELETE /api/document-types/{id}
 *
 * Refuses to delete a type that is in use or is a system type — removing it
 * would leave uploaded documents pointing at a type that no longer exists.
 * Deactivating is the safe way to retire a type: it disappears from capture and
 * stops being enforced, while existing documents keep their label.
 */
final class DeleteDocumentTypeAction
{
    use ApiResponse;

    public function __construct(
        private readonly DocumentTypeConfigRepository $repo,
        private readonly EntityManagerInterface $em,
        private readonly AuditService $audit,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $dt = $this->repo->find($args['id'] ?? '');
        if ($dt === null) return $this->notFound('Document type not found');

        if ($dt->isSystem()) {
            return $this->error('System document types cannot be deleted. Deactivate it instead.', 422);
        }

        $inUse = (int) $this->em->createQueryBuilder()
            ->select('COUNT(d.id)')->from(Document::class, 'd')
            ->where('d.type = :code')->setParameter('code', $dt->getCode())
            ->getQuery()->getSingleScalarResult();

        if ($inUse > 0) {
            return $this->error(
                "This document type is used by {$inUse} uploaded document(s) and cannot be deleted. Deactivate it instead.",
                422,
            );
        }

        $before = $dt->toArray();
        $this->repo->remove($dt);
        $this->audit->logDelete($request->getAttribute('user_id'), 'DocumentType', $before['id'], $before, $this->getClientIp($request), $this->getUserAgent($request));

        return $this->success(null, 'Document type deleted');
    }
}
