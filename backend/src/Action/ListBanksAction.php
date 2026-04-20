<?php
declare(strict_types=1);
namespace App\Action;

use App\Infrastructure\Data\NigerianBanks;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GET /banks
 * Returns list of Nigerian banks for dropdowns/lookups.
 */
final class ListBanksAction
{
    use ApiResponse;

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return $this->success(NigerianBanks::forSelect());
    }
}
