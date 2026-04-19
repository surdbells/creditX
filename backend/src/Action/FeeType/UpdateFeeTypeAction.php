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

        $old = $ft->toArray();
        $data = (array) ($request->getParsedBody() ?? []);
        $isSystem = $ft->isSystem();

        // Non-system fees: allow all fields. System fees: only GL mapping + is_active.
        if (!$isSystem) {
            if (isset($data['name']) && $data['name'] !== '') $ft->setName($data['name']);
            if (isset($data['description'])) $ft->setDescription($data['description']);
        }
        if (array_key_exists('gl_account_id', $data)) $ft->setGlAccountId($data['gl_account_id'] ?: null);
        if (isset($data['is_active'])) $ft->setIsActive(filter_var($data['is_active'], FILTER_VALIDATE_BOOLEAN));

        $this->repo->flush();
        $this->audit->logUpdate($request->getAttribute('user_id'), 'FeeType', $ft->getId(), $old, $ft->toArray(), $this->getClientIp($request), $this->getUserAgent($request));
        return $this->success($ft->toArray(), 'Fee type updated successfully');
    }
}
