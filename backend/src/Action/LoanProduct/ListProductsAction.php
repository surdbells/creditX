<?php
declare(strict_types=1);
namespace App\Action\LoanProduct;

use App\Domain\Repository\LoanProductRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GET /api/loan-products
 *
 * Optional `channel` (agent_app | back_office) narrows the list to products
 * offerable on that channel — the agent app and back-office capture pass it so
 * they only show what they are allowed to sell.
 *
 * Admin product management passes NOTHING and therefore sees every product,
 * including ones switched off everywhere. That is deliberate: filtering the
 * management screen by availability would make a product disabled on all
 * channels impossible to find and re-enable.
 */
final class ListProductsAction
{
    use ApiResponse;

    private const CHANNELS = ['agent_app', 'back_office', 'portal'];

    public function __construct(private readonly LoanProductRepository $repo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $params = $request->getQueryParams();
        $p = $this->getPaginationParams($params);
        $result = $this->repo->paginated($p['offset'], $p['per_page'], $p['sort_by'], $p['sort_dir'], $p['search'] ?: null,
            isset($params['is_active']) ? filter_var($params['is_active'], FILTER_VALIDATE_BOOLEAN) : null);

        $items = $result['items'];
        $total = $result['total'];

        $channel = trim((string) ($params['channel'] ?? ''));
        if ($channel !== '' && in_array($channel, self::CHANNELS, true)) {
            $items = array_values(array_filter($items, fn($prod) => $prod->isAvailableOn($channel)));
            // Recount against the filtered set. Availability is a per-row flag
            // rather than a query predicate, so the paginated total would
            // otherwise overstate what the caller can actually see.
            $total = count($items);
        }

        return $this->paginated(array_map(fn($prod) => $prod->toArray(true), $items), $total, $p['page'], $p['per_page']);
    }
}
