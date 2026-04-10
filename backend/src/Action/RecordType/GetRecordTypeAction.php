<?php
declare(strict_types=1);
namespace App\Action\RecordType;

use App\Domain\Repository\RecordTypeRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class GetRecordTypeAction
{
    use ApiResponse;
    public function __construct(private readonly RecordTypeRepository $repo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $rt = $this->repo->find($args['id'] ?? '');
        if ($rt === null) return $this->notFound('Record type not found');
        return $this->success($rt->toArray());
    }
}
