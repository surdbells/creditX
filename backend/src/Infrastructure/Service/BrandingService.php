<?php
declare(strict_types=1);

namespace App\Infrastructure\Service;

use App\Domain\Entity\SystemSetting;
use App\Domain\Enum\SettingCategory;
use App\Domain\Enum\SettingType;
use App\Domain\Repository\SystemSettingRepository;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Per-organization branding, backed by system_settings.
 *
 * Each client runs its own backend + DB, so branding lives in that tenant's
 * settings and is served to the tenant's frontends (admin/portal) via the
 * public settings endpoint. This service upserts the brand.* keys so it works
 * on existing installs without a reseed, and reads them with sensible
 * CreditX defaults.
 */
final class BrandingService
{
    public const DEFAULT_PRIMARY = '#0A4F2A';
    public const DEFAULT_ACCENT  = '#C9A227';

    public function __construct(
        private readonly SystemSettingRepository $repo,
        private readonly EntityManagerInterface $em,
        private readonly SettingsCacheService $cache,
    ) {}

    /** Current branding (with defaults) for the admin UI + email builder. */
    public function get(): array
    {
        return [
            'primary_color' => (string) $this->cache->get('brand.primary_color', self::DEFAULT_PRIMARY),
            'accent_color'  => (string) $this->cache->get('brand.accent_color', self::DEFAULT_ACCENT),
            'logo_url'      => (string) $this->cache->get('brand.logo_url', ''),
            'logo_path'     => (string) $this->cache->get('brand.logo_path', ''),
            'company_name'  => (string) $this->cache->get('general.company_name', 'CreditX'),
        ];
    }

    /**
     * Upsert a set of setting key => value pairs (all string type, general
     * category), then invalidate the settings cache once.
     *
     * @param array<string, string> $kv
     */
    public function set(array $kv): void
    {
        foreach ($kv as $key => $value) {
            $setting = $this->repo->findByKey($key);
            if ($setting === null) {
                $setting = new SystemSetting();
                $setting->setKey($key);
                $setting->setType(SettingType::STRING);
                $setting->setCategory(SettingCategory::GENERAL);
                $this->em->persist($setting);
            }
            $setting->setValue((string) $value);
        }
        $this->em->flush();
        $this->cache->invalidate();
    }
}
