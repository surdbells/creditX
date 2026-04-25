<?php

declare(strict_types=1);

namespace App\Infrastructure\Service;

/**
 * Static handle to the SettingsCacheService instance.
 *
 * Used by code paths that can't easily receive the service via DI —
 * primarily the ApiResponse trait, which is mixed into many Action
 * classes that don't (and shouldn't have to) inject SettingsCacheService
 * just to read pagination defaults.
 *
 * Set once at app boot in public/index.php after the container is built.
 * CLI scripts and tests that don't need settings can leave it null;
 * callers must handle the null case (the trait does, falling back to
 * a hardcoded default).
 *
 * This is deliberately a thin module-scoped registrar rather than a
 * generic service locator — it exposes only SettingsCacheService and
 * resists growing into an ambient global container.
 */
final class SettingsRegistry
{
    private static ?SettingsCacheService $settings = null;

    public static function set(SettingsCacheService $settings): void
    {
        self::$settings = $settings;
    }

    public static function get(): ?SettingsCacheService
    {
        return self::$settings;
    }
}
