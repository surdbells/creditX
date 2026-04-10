<?php
declare(strict_types=1);
namespace App\Action\Payment;

use App\Domain\Repository\PaymentRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class ListPaymentsAction
{
    use ApiResponse;
    public function __construct(private readonly PaymentRepository $repo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $params = $request->getQueryParams();
        $p = $this->getPaginationParams($params);
        $result = $this->repo->paginated($p['offset'], $p['per_page'], $p['sort_by'], $p['sort_dir'], $p['search'] ?: null,
            $params['loan_id'] ?? null, $params['customer_id'] ?? null, $params['channel'] ?? null, $params['status'] ?? null);
        $items = array_map(fn($pay) => $pay->toArray(), $result['items']);
        return $this->paginated($items, $result['total'], $p['page'], $p['per_page']);
    }
}
