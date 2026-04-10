<?php

declare(strict_types=1);

namespace App\Infrastructure\Service;

use App\Domain\Entity\SystemSetting;
use Doctrine\ORM\EntityManagerInterface;

final class SettingsCacheService
{
    private const CACHE_KEY = 'system_settings';
    private const CACHE_TTL = 3600; // 1 hour

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly RedisService $redis,
    ) {
    }

    /**
     * Get a single setting value by key.
     */
    public function get(string $key, mixed $default = null): mixed
    {
        $settings = $this->all();
        return $settings[$key] ?? $default;
    }

    /**
     * Get a boolean setting.
     */
    public function getBool(string $key, bool $default = false): bool
    {
        $value = $this->get($key);
        if ($value === null) {
            return $default;
        }
        return filter_var($value, FILTER_VALIDATE_BOOLEAN);
    }

    /**
     * Get an integer setting.
     */
    public function getInt(string $key, int $default = 0): int
    {
        $value = $this->get($key);
        if ($value === null) {
            return $default;
        }
        return (int) $value;
    }

    /**
     * Get a JSON setting as array.
     */
    public function getJson(string $key, array $default = []): array
    {
        $value = $this->get($key);
        if ($value === null) {
            return $default;
        }
        $decoded = json_decode($value, true);
        return is_array($decoded) ? $decoded : $default;
    }

    /**
     * Get all settings as key => value map.
     */
    public function all(): array
    {
        $cached = $this->redis->getJson(self::CACHE_KEY);
        if ($cached !== null) {
            return $cached;
        }

        return $this->rebuild();
    }

    /**
     * Rebuild cache from database.
     */
    public function rebuild(): array
    {
        $repo = $this->em->getRepository(SystemSetting::class);
        $settings = $repo->findAll();

        $map = [];
        /** @var SystemSetting $setting */
        foreach ($settings as $setting) {
            $map[$setting->getKey()] = $setting->getValue();
        }

        $this->redis->setJson(self::CACHE_KEY, $map, self::CACHE_TTL);

        return $map;
    }

    /**
     * Invalidate settings cache (call after any setting update).
     */
    public function invalidate(): void
    {
        $this->redis->delete(self::CACHE_KEY);
    }
}
