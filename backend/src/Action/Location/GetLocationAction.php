<?php
declare(strict_types=1);
namespace App\Action\Location;

use App\Domain\Repository\LocationRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class GetLocationAction
{
    use ApiResponse;
    public function __construct(private readonly LocationRepository $repo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $location = $this->repo->find($args['id'] ?? '');
        if ($location === null) return $this->notFound('Location not found');
        return $this->success($location->toArray());
    }
}
