<?php
declare(strict_types=1);
namespace App\Action\Branding;

use App\Infrastructure\Service\{ApiResponse, BrandingService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GET /api/branding — current org branding for the admin Branding screen.
 */
final class GetBrandingAction
{
    use ApiResponse;

    public function __construct(private readonly BrandingService $branding) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return $this->success($this->branding->get());
    }
}
