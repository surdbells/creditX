<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Domain\Repository\GeneralLedgerRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class GetGlAccountAction
{
    use ApiResponse;
    public function __construct(private readonly GeneralLedgerRepository $repo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $gl = $this->repo->find($args['id'] ?? '');
        if ($gl === null) return $this->notFound('GL account not found');
        return $this->success($gl->toArray());
    }
}
