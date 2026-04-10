<?php
declare(strict_types=1);
namespace App\Action\GovRecord;

use App\Domain\Repository\GovernmentRecordRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class DeleteGovRecordAction
{
    use ApiResponse;
    public function __construct(
        private readonly GovernmentRecordRepository $repo,
        private readonly AuditService $audit,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $record = $this->repo->find($args['id'] ?? '');
        if ($record === null) return $this->notFound('Government record not found');

        $old = $record->toArray();
        $this->repo->remove($record);
        $this->repo->flush();

        $this->audit->logDelete($request->getAttribute('user_id'), 'GovernmentRecord', $args['id'], $old, $this->getClientIp($request), $this->getUserAgent($request));
        return $this->success(null, 'Government record deleted successfully');
    }
}
