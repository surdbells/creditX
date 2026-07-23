<?php
declare(strict_types=1);
namespace App\Action\CreditBureau;

use App\Domain\Entity\CreditCheck;
use App\Domain\Repository\CreditCheckRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/** GET /api/credit-bureau/checks/{id} — one enquiry, including the full report. */
final class GetCreditCheckAction
{
    use ApiResponse;

    public function __construct(private readonly CreditCheckRepository $repo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        /** @var CreditCheck|null $check */
        $check = $this->repo->find($args['id'] ?? '');
        if ($check === null) return $this->notFound('Credit check not found');
        return $this->success($check->toArray(true));
    }
}
