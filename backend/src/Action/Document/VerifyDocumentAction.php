<?php
declare(strict_types=1);
namespace App\Action\Document;

use App\Domain\Enum\DocumentStatus;
use App\Domain\Repository\DocumentRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class VerifyDocumentAction
{
    use ApiResponse;
    public function __construct(
        private readonly DocumentRepository $repo,
        private readonly AuditService $audit,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $doc = $this->repo->find($args['id'] ?? '');
        if ($doc === null) return $this->notFound('Document not found');

        $data = (array) ($request->getParsedBody() ?? []);
        $action = $data['action'] ?? ''; // 'verify' or 'reject'

        if (!in_array($action, ['verify', 'reject'], true)) {
            return $this->validationError(['action' => 'Action must be "verify" or "reject"']);
        }

        $old = $doc->toArray();
        $userId = $request->getAttribute('user_id');

        if ($action === 'verify') {
            $doc->verify($userId);
        } else {
            $reason = $data['reason'] ?? 'Rejected';
            $doc->reject($userId, $reason);
        }

        $this->repo->flush();
        $this->audit->logUpdate($userId, 'Document', $doc->getId(), $old, $doc->toArray(), $this->getClientIp($request), $this->getUserAgent($request));
        return $this->success($doc->toArray(), 'Document ' . ($action === 'verify' ? 'verified' : 'rejected') . ' successfully');
    }
}
