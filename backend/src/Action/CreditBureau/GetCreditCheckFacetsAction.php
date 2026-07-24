<?php
declare(strict_types=1);
namespace App\Action\CreditBureau;

use App\Domain\Repository\CreditCheckRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GET /api/credit-bureau/checks/facets — distinct values present in the
 * enquiry history, used to populate the history filter dropdowns.
 *
 * Risk bands are provider free-text, so they cannot be hard-coded in the UI;
 * this returns only options that can actually match a row.
 *
 * NOTE: must be routed BEFORE /credit-bureau/checks/{id}, or the id route
 * swallows "facets".
 */
final class GetCreditCheckFacetsAction
{
    use ApiResponse;

    public function __construct(private readonly CreditCheckRepository $repo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return $this->success($this->repo->facets());
    }
}
