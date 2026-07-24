<?php
declare(strict_types=1);
namespace App\Action\CreditBureau;

use App\Domain\Repository\CreditCheckRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GET /api/credit-bureau/checks — paginated enquiry history.
 *
 * Optional query: search (BVN / customer / app id / provider ref / initiator),
 * status, subject_type, risk_band, provider, decision, linked
 * (loan|standalone), date_from, date_to (Y-m-d), plus sort_by / sort_dir.
 */
final class ListCreditChecksAction
{
    use ApiResponse;

    private const FILTER_KEYS = ['status', 'subject_type', 'risk_band', 'provider', 'decision', 'linked', 'date_from', 'date_to'];

    public function __construct(private readonly CreditCheckRepository $repo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $params = $request->getQueryParams();
        $p = $this->getPaginationParams($params);

        $filters = [];
        foreach (self::FILTER_KEYS as $k) {
            $filters[$k] = isset($params[$k]) ? (string) $params[$k] : null;
        }

        $result = $this->repo->findPaginated(
            $p['offset'],
            $p['per_page'],
            $p['search'] ?: null,
            $filters,
            $p['sort_by'],
            $p['sort_dir'],
        );

        return $this->paginated(array_map(fn($c) => $c->toArray(), $result['items']), $result['total'], $p['page'], $p['per_page']);
    }
}
