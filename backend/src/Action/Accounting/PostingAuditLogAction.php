<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Domain\Repository\PostingAuditRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GET /api/accounting/posting-audit — the searchable, exportable log of every
 * posting that did not land on the current accounting date (§9, §16).
 *
 * Filters: from, to, user_id, entry_type; search covers narration, reason and
 * journal id. Gated by accounting.view.
 */
final class PostingAuditLogAction
{
    use ApiResponse;

    public function __construct(private readonly PostingAuditRepository $repo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $params = $request->getQueryParams();
        $p = $this->getPaginationParams($params);

        $filters = [];
        foreach (['from', 'to', 'user_id', 'entry_type'] as $k) {
            $filters[$k] = isset($params[$k]) ? (string) $params[$k] : null;
        }

        $result = $this->repo->findPaginated($p['offset'], $p['per_page'], $p['search'] ?: null, $filters);
        return $this->paginated(
            array_map(fn($a) => $a->toArray(), $result['items']),
            $result['total'], $p['page'], $p['per_page'],
        );
    }
}
