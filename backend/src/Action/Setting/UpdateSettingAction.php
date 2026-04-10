<?php
declare(strict_types=1);
namespace App\Action\Setting;

use App\Domain\Enum\{SettingCategory, SettingType};
use App\Domain\Repository\SystemSettingRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService, InputValidator, SettingsCacheService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class UpdateSettingAction
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

        $old = $setting->toArray();
        $data = (array) ($request->getParsedBody() ?? []);
        $v = InputValidator::validate($data, [
            'value'       => ['required' => false, 'type' => 'string'],
            'type'        => ['required' => false, 'type' => 'string', 'in' => array_column(SettingType::cases(), 'value')],
            'category'    => ['required' => false, 'type' => 'string', 'in' => array_column(SettingCategory::cases(), 'value')],
            'description' => ['required' => false, 'type' => 'string', 'max' => 500],
        ]);
        if (!empty($v['errors'])) return $this->validationError($v['errors']);
        $c = $v['clean'];

        if (isset($c['value']) && $c['value'] !== null) $setting->setValue($c['value']);
        if (isset($c['type']) && $c['type'] !== null) $setting->setType(SettingType::from($c['type']));
        if (isset($c['category']) && $c['category'] !== null) $setting->setCategory(SettingCategory::from($c['category']));
        if (array_key_exists('description', $c)) $setting->setDescription($c['description']);

        $this->repo->flush();
        $this->cache->invalidate();

        $this->audit->logUpdate($request->getAttribute('user_id'), 'SystemSetting', $setting->getId(), $old, $setting->toArray(), $this->getClientIp($request), $this->getUserAgent($request));
        return $this->success($setting->toArray(), 'Setting updated successfully');
    }
}
