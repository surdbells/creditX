<?php
declare(strict_types=1);
namespace App\Action\Setting;

use App\Domain\Entity\SystemSetting;
use App\Domain\Enum\{SettingCategory, SettingType};
use App\Domain\Repository\SystemSettingRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService, InputValidator, SettingsCacheService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class CreateSettingAction
{
    use ApiResponse;
    public function __construct(
        private readonly SystemSettingRepository $repo,
        private readonly AuditService $audit,
        private readonly SettingsCacheService $cache,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = (array) ($request->getParsedBody() ?? []);
        $v = InputValidator::validate($data, [
            'key'         => ['required' => true, 'type' => 'string', 'min' => 1, 'max' => 100],
            'value'       => ['required' => true, 'type' => 'string'],
            'type'        => ['required' => false, 'type' => 'string', 'in' => array_column(SettingType::cases(), 'value'), 'default' => SettingType::STRING->value],
            'category'    => ['required' => false, 'type' => 'string', 'in' => array_column(SettingCategory::cases(), 'value'), 'default' => SettingCategory::GENERAL->value],
            'description' => ['required' => false, 'type' => 'string', 'max' => 500],
        ]);
        if (!empty($v['errors'])) return $this->validationError($v['errors']);

        if ($this->repo->keyExists($v['clean']['key'])) {
            return $this->validationError(['key' => 'Setting key already exists']);
        }

        $setting = new SystemSetting();
        $setting->setKey($v['clean']['key']);
        $setting->setValue($v['clean']['value']);
        $setting->setType(SettingType::from($v['clean']['type']));
        $setting->setCategory(SettingCategory::from($v['clean']['category']));
        $setting->setDescription($v['clean']['description'] ?? null);
        $this->repo->save($setting);
        $this->cache->invalidate();

        $this->audit->logCreate($request->getAttribute('user_id'), 'SystemSetting', $setting->getId(), $setting->toArray(), $this->getClientIp($request), $this->getUserAgent($request));
        return $this->created($setting->toArray(), 'Setting created successfully');
    }
}
