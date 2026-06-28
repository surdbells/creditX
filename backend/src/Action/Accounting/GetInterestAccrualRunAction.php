<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Domain\Entity\InterestAccrualRun;
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GET /api/accounting/interest-accrual/runs/{id}
 *
 * One accrual run with its per-loan line breakdown.
 *
 * Gated by accounting.provision.
 */
final class GetInterestAccrualRunAction
{
    use ApiResponse;

    public function __construct(private readonly EntityManagerInterface $em) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $run = $this->em->find(InterestAccrualRun::class, $args['id'] ?? '');
        if ($run === null) {
            return $this->notFound('Interest accrual run not found');
        }
        return $this->success($run->toArray(true));
    }
}
