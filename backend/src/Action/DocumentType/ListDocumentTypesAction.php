<?php
declare(strict_types=1);
namespace App\Action\DocumentType;

use App\Domain\Repository\DocumentTypeConfigRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GET /api/document-types[?active=true]
 *
 * Lists configurable loan document types. The agent capture wizard calls this
 * with active=true to build its upload list; the admin CRUD screen lists all.
 */
final class ListDocumentTypesAction
{
    use ApiResponse;

    public function __construct(private readonly DocumentTypeConfigRepository $repo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $q = $request->getQueryParams();
        $activeOnly = isset($q['active']) && filter_var($q['active'], FILTER_VALIDATE_BOOLEAN);

        $items = $activeOnly ? $this->repo->findActive() : $this->repo->findAllOrdered();
        return $this->success(array_map(fn($d) => $d->toArray(), $items));
    }
}
