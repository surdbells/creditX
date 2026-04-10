<?php
declare(strict_types=1);
namespace App\Action\RecordType;

use App\Domain\Repository\RecordTypeRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class DeleteRecordTypeAction
{
    use ApiResponse;
    public function __construct(private readonly RecordTypeRepository $repo, private readonly AuditService $audit) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $rt = $this->repo->find($args['id'] ?? '');
        if ($rt === null) return $this->notFound('Record type not found');
        if ($rt->getRecordCount() > 0) return $this->error('Cannot delete record type with existing records. Deactivate it instead.', 409);

        $old = $rt->toArray();
        $this->repo->remove($rt);
        $this->repo->flush();
        $this->audit->logDelete($request->getAttribute('user_id'), 'RecordType', $args['id'], $old, $this->getClientIp($request), $this->getUserAgent($request));
        return $this->success(null, 'Record type deleted successfully');
    }
}
