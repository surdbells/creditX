<?php
declare(strict_types=1);
namespace App\Action\Loan;

use App\Domain\Repository\LoanRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class GetLoanAction
{
    use ApiResponse;
    public function __construct(private readonly LoanRepository $repo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $loan = $this->repo->find($args['id'] ?? '');
        if ($loan === null) return $this->notFound('Loan not found');
        return $this->success($loan->toArray(true));
    }
}
