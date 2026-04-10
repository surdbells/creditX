<?php
declare(strict_types=1);
namespace App\Action\FeeType;

use App\Domain\Repository\FeeTypeRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class UpdateFeeTypeAction
{
    use ApiResponse;
    public function __construct(private readonly FeeTypeRepository $repo, private readonly AuditService $audit) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $ft = $this->repo->find($args['id'] ?? '');
        if ($ft === null) return $this->notFound('Fee type not found');
        if ($ft->isSystem()) return $this->error('System fee types cannot be modified', 403);

        $old = $ft->toArray();
        $data = (array) ($request->getParsedBody() ?? []);

        if (isset($data['name']) && $data['name'] !== '') $ft->setName($data['name']);
        if (isset($data['description'])) $ft->setDescription($data['description']);
        if (isset($data['gl_account_id'])) $ft->setGlAccountId($data['gl_account_id']);
        if (isset($data['is_active'])) $ft->setIsActive(filter_var($data['is_active'], FILTER_VALIDATE_BOOLEAN));

        $this->repo->flush();
        $this->audit->logUpdate($request->getAttribute('user_id'), 'FeeType', $ft->getId(), $old, $ft->toArray(), $this->getClientIp($request), $this->getUserAgent($request));
        return $this->success($ft->toArray(), 'Fee type updated successfully');
    }
}
