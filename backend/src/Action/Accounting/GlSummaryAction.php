<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Domain\Repository\{GeneralLedgerRepository, LedgerTransactionRepository};
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class GlSummaryAction
{
    use ApiResponse;
    public function __construct(
        private readonly GeneralLedgerRepository $glRepo,
        private readonly LedgerTransactionRepository $txRepo,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $gl = $this->glRepo->find($args['id'] ?? '');
        if ($gl === null) return $this->notFound('GL account not found');

        $params = $request->getQueryParams();
        $year = $params['year'] ?? date('Y');

        $today = $this->txRepo->getGlSum($gl->getId(), date('Y'), date('m'), date('d'));
        $thisMonth = $this->txRepo->getGlSum($gl->getId(), date('Y'), date('m'));
        $thisYear = $this->txRepo->getGlSum($gl->getId(), $year);
        $allTime = $this->txRepo->getGlSum($gl->getId());

        return $this->success([
            'account' => $gl->toArray(),
            'today' => $today, 'this_month' => $thisMonth,
            'this_year' => $thisYear, 'all_time' => $allTime,
        ]);
    }
}
