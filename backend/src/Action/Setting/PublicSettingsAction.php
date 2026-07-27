<?php
declare(strict_types=1);
namespace App\Action\Setting;

use App\Infrastructure\Service\{ApiResponse, SettingsCacheService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GET /api/settings/public
 *
 * Returns a curated whitelist of system settings that are safe to
 * expose without authentication. The frontend's APP_INITIALIZER hits
 * this once on boot to hydrate user-facing presentation values:
 * currency symbol, company name, support email, etc.
 *
 * Distinct from GET /api/settings (admin-gated, returns every setting
 * including sensitive ones like 2fa.* and security.*). Adding a key
 * to the public-allowed list is a deliberate audit step — never
 * proxy the full settings table here.
 *
 * Cache: SettingsCacheService already caches reads in Redis, so this
 * endpoint is essentially free per-request. No additional HTTP-level
 * caching is needed; the frontend caches the response in a service
 * signal for the lifetime of the page session.
 *
 * Response shape:
 *   { "data": { "general.currency_symbol": "₦", "general.currency": "NGN", ... } }
 *
 * Returns key/value pairs (not the full SystemSetting object) so the
 * payload stays small and the public surface area is minimal — ids,
 * timestamps, encryption flags, and other admin-only metadata are
 * deliberately not exposed.
 */
final class PublicSettingsAction
{
    use ApiResponse;

    /**
     * Whitelist of keys safe to expose without authentication. Add
     * entries here only after considering whether the value is
     * presentation-only (currency symbol, brand) versus security-
     * sensitive (max attempts, OTP TTL, maker-checker flags).
     */
    private const PUBLIC_KEYS = [
        'general.currency',
        'general.currency_symbol',
        'general.company_name',
        'general.support_email',
        'general.date_format',
        // Minimum agent-app version this tenant's API supports. The mobile
        // app reads this during tenant resolution and forces an update when
        // its build is older. Presentation/compat only — safe to expose.
        'mobile.min_agent_version',
        // Per-org branding — presentation only, safe to expose. Frontends read
        // these before auth to theme the login screen. logo_path stays private;
        // only the public logo_url is exposed.
        'brand.primary_color',
        'brand.accent_color',
        'brand.logo_url',
        // Whether the contextual page guides (Walkthrough / Overview) are
        // offered at all. Presentation-only, and needed before any guided page
        // renders, so it belongs in the same boot payload as branding.
        'ui.page_guides_enabled',
    ];

    public function __construct(
        private readonly SettingsCacheService $settings,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $out = [];
        foreach (self::PUBLIC_KEYS as $key) {
            // Only emit keys that are actually present in the database.
            // Missing keys are skipped rather than emitted as null so
            // the client can distinguish "admin hasn't configured this"
            // from "admin set it to empty string".
            $value = $this->settings->get($key);
            if ($value !== null) {
                $out[$key] = $value;
            }
        }
        return $this->success($out);
    }
}
