<?php

declare(strict_types=1);

namespace App\Action\Invest;

use App\Domain\Repository\InvestmentRepository;
use App\Infrastructure\Service\{ApiResponse, InvestmentService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GET /api/invest/investments — the authenticated investor's own investments,
 * each with its performance block so the app can show what the money has
 * earned without a second call.
 *
 * The customer id comes from the investor-scoped token, never from a query
 * param, so an investor can never see another investor's holdings.
 */
final class ListMyInvestmentsAction
{
    use ApiResponse;

    public function __construct(
        private readonly InvestmentRepository $repo,
        private readonly InvestmentService $service,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $customerId = (string) $request->getAttribute('customer_id');
        $items = $this->repo->findForCustomer($customerId);

        $out = [];
        $totalValue = '0.00';
        $totalEarned = '0.00';
        foreach ($items as $inv) {
            $out[] = $inv->toArray() + ['performance' => $this->service->performance($inv)];
            if ($inv->isActive()) {
                $totalValue = bcadd($totalValue, $inv->currentValue(), 2);
            }
            $totalEarned = bcadd($totalEarned, $inv->getInterestEarnedToDate(), 2);
        }

        return $this->success([
            'investments' => $out,
            'summary'     => [
                'active_count'            => count(array_filter($items, fn($i) => $i->isActive())),
                'total_count'             => count($items),
                'total_current_value'     => $totalValue,
                'total_interest_earned'   => $totalEarned,
            ],
        ]);
    }
}
