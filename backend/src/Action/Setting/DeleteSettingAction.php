<?php
declare(strict_types=1);
namespace App\Action\Setting;

use App\Domain\Repository\SystemSettingRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService, SettingsCacheService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class DeleteSettingAction
{
    use ApiResponse;
    public function __construct(
        private readonly SystemSettingRepository $repo,
        private readonly AuditService $audit,
        private readonly SettingsCacheService $cache,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $setting = $this->repo->find($args['id'] ?? '');
        if ($setting === null) return $this->notFound('Setting not found');
        if ($setting->isEncrypted()) return $this->error('System-protected settings cannot be deleted', 403);

        $old = $setting->toArray();
        $this->repo->remove($setting);
        $this->repo->flush();
        $this->cache->invalidate();

        $this->audit->logDelete($request->getAttribute('user_id'), 'SystemSetting', $args['id'], $old, $this->getClientIp($request), $this->getUserAgent($request));
        return $this->success(null, 'Setting deleted successfully');
    }
}
