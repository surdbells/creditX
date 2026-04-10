<?php
declare(strict_types=1);
namespace App\Action\GovRecord;

use App\Domain\Repository\GovernmentRecordRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class GetGovRecordAction
{
    use ApiResponse;
    public function __construct(private readonly GovernmentRecordRepository $repo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $record = $this->repo->find($args['id'] ?? '');
        if ($record === null) return $this->notFound('Government record not found');
        return $this->success($record->toArray());
    }
}
