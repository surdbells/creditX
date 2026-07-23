<?php

declare(strict_types=1);

/**
 * Sentry initialization. Called once per request from public/index.php, after
 * the environment is loaded.
 *
 * No-ops when SENTRY_DSN is empty, so it's safe on any deployment that hasn't
 * configured it. One DSN is shared across deployments; SENTRY_ENVIRONMENT
 * (e.g. "fti", "karicash") distinguishes them, and every event is tagged
 * app=backend.
 */
return function (): void {
    $dsn = trim((string) ($_ENV['SENTRY_DSN'] ?? ''));
    if ($dsn === '' || !class_exists(\Sentry\SentrySdk::class)) {
        return;
    }

    \Sentry\init([
        'dsn'          => $dsn,
        'environment'  => (string) ($_ENV['SENTRY_ENVIRONMENT'] ?? ($_ENV['APP_ENV'] ?? 'production')),
        'release'      => (string) ($_ENV['SENTRY_RELEASE'] ?? ''),
        // Performance tracing is opt-in and off by default (0.0) to control cost.
        'traces_sample_rate' => (float) ($_ENV['SENTRY_TRACES_SAMPLE_RATE'] ?? 0.0),
        // Don't send local variable values / request bodies — they can contain
        // BVNs, bank details, OTPs. Errors still carry the stack trace + message.
        'send_default_pii' => false,
    ]);

    \Sentry\configureScope(function (\Sentry\State\Scope $scope): void {
        $scope->setTag('app', 'backend');
    });
};
