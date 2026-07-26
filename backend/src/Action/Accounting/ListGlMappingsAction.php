<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Infrastructure\Service\{ApiResponse, GlMappingService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GET /api/accounting/gl-mappings — the loan-lifecycle GL roles, each with the
 * account it currently posts to (override or default) so the Default Ledgers
 * page can show and edit them.
 */
final class ListGlMappingsAction
{
    use ApiResponse;

    public function __construct(private readonly GlMappingService $mapping) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return $this->success($this->mapping->list());
    }
}
