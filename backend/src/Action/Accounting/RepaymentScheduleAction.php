<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Domain\Repository\RepaymentScheduleRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class RepaymentScheduleAction
{
    use ApiResponse;
    public function __construct(private readonly RepaymentScheduleRepository $repo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $loanId = $args['loanId'] ?? '';
        $schedules = $this->repo->findByLoan($loanId);
        $items = array_map(fn($s) => $s->toArray(), $schedules);
        return $this->success($items);
    }
}
